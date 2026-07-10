# Inbound Form Module — Design

Date: 2026-07-10
Status: approved by repository owner (interactive brainstorming session)

## Goal

A customer configures an "inbound form" in the admin frontend: pick one of the already-registered
domains, define form fields, security schemes, and receivers. The service then exposes a public,
unauthenticated HTTP endpoint that customer websites POST form submissions to — no customer backend
required. Each accepted submission fans out to the form's receivers as DKIM-signed emails rendered
from versioned Handlebars templates. Email transport lives in a new, separate mail module that a
future "send email via API" feature will reuse.

## Decisions (settled with the owner)

| Topic                       | Decision                                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport                   | Nodemailer SMTP relay configured via env (`SMTP_*`); MailHog in dev. DKIM signing in-app with the domain's active key.                                                |
| Send timing                 | Public endpoint responds immediately; sending is async fire-and-forget in-process, failures recorded on delivery rows.                                                |
| Security value transport    | `BODY` added to `InboundFormSecurityLocation` (keep `HEADER`, `QUERY`).                                                                                               |
| Scheme config               | Nullable `config` JSONB per security row (reCAPTCHA: `{ secret, minScore? }`). Plaintext for now; encrypting via the DKIM encryption service is a possible follow-up. |
| Dynamic receivers           | `emailReceiver` / `emailReplyTo` hold a literal address or a `{{fieldKey}}` placeholder; only `EMAIL`-typed fields are eligible.                                      |
| Field model                 | New `type` enum column (`text`, `email`, `number`, `boolean`) + typed `validation` JSON for extra constraints.                                                        |
| Template versioning         | Per receiver: at most one mutable draft + immutable published history. Sending uses the newest published version.                                                     |
| Template engine             | Handlebars (logic-less, no server-side code execution, renders in the browser for live preview).                                                                      |
| Persistence                 | Submissions and per-receiver delivery status are stored.                                                                                                              |
| HTTP-layer abuse protection | Open CORS (`Access-Control-Allow-Origin: *`) + per-IP rate limiting via `@nestjs/throttler` on the public controller only.                                            |
| Module split                | Two backend modules: `InboundFormModule` (forms, security, submissions, both controllers) and `MailModule` (SMTP, DKIM, Handlebars renderer).                         |
| Editor                      | Monaco (built-in `handlebars` language) + field-chip toolbar + debounced live preview in a sandboxed iframe.                                                          |

## Public request contract

```
POST /api/public/form/:slug
{
    "security": { "recaptcha-token": "…", "honeypot": null },
    "data": { "firstName": "Max", "email": "test@example.com" }
}
→ 201 { "status": "accepted" }
```

- Security values are read from the location each scheme configures (`security` body object,
  header, or query param), addressed by the scheme's `key`.
- `data` is validated against the form's field definitions; unknown keys are stripped, defaults
  applied.
- Honeypot hits respond `201 accepted` but the submission is stored as `spam` and no email is sent.
- reCAPTCHA failure responds `403`. Unknown/inactive slug responds `404`. Validation failure `400`.

## Data model

All schema changes land in one new migration (`006-*`). Tables from migration 005 remain.

### `inbound_form_fields` (altered)

- Add `type` VARCHAR(255) NOT NULL DEFAULT `'text'` — TS enum `InboundFormFieldType`:
  `TEXT | EMAIL | NUMBER | BOOLEAN`.
- `validation` JSON column stays; its TS type changes from `string | null` to
  `InboundFormFieldValidation | null`:
  `{ required?: boolean; minLength?: number; maxLength?: number; pattern?: string; min?: number; max?: number }`.
- Type drives base validation, the setup UI, and receiver-placeholder eligibility (`EMAIL` only).

### `inbound_form_security` (altered)

- Add `config` JSONB NULL. reCAPTCHA rows: `{ secret: string; minScore?: number }` (supports v2 and
  v3 — score checked only when `minScore` is set). Honeypot: no config.
- Add unique index on `(inboundFormId, type)` — at most one scheme per type per form.
- `InboundFormSecurityLocation` gains `BODY` (code-only; column is already a string).
- `CSRF` stays in the type enum but is rejected at save time (not implemented in this iteration).

### `inbound_form_receiver` (altered)

- Add `emailReplyTo` VARCHAR(255) NULL — literal or `{{fieldKey}}`, same rules as `emailReceiver`.
  Rationale: owner-notification mail must be _From_ the form's domain for DKIM alignment, so
  Reply-To is what lets the owner answer the submitter directly.

### `inbound_form_template` (altered)

- Add `subject` VARCHAR(255) NOT NULL DEFAULT `''` — Handlebars-templated, versioned with the body.
- Add `updatedAt` (backfilled from `createdAt`; model's `updatedAt` turned on) — drafts are edited
  in place, so "last saved" must be tracked.
- Add partial unique index: `(inboundFormReceiverId) WHERE status = 'draft'` — single draft per
  receiver, enforced by the DB.

### `inbound_form_submission` (new)

| Column                    | Type                                 | Notes                                                    |
| ------------------------- | ------------------------------------ | -------------------------------------------------------- |
| `inboundFormSubmissionId` | INTEGER PK autoincrement             |                                                          |
| `inboundFormId`           | INTEGER FK → `inbound_form`, CASCADE | audit data is deleted with the form (accepted trade-off) |
| `data`                    | JSONB NOT NULL                       | the validated, stripped field values                     |
| `status`                  | VARCHAR(255) NOT NULL                | `accepted \| spam`                                       |
| `createdAt`               | DATE NOT NULL                        | no `updatedAt`                                           |

### `inbound_form_delivery` (new)

One row per accepted submission × receiver that is active and has a published template at submit
time. `spam` submissions get no delivery rows. Recipient placeholders resolve at send time; an
unresolvable recipient (optional email field left empty) marks the row `failed` with a descriptive
`error` instead of sending.

| Column                    | Type                                              | Notes                              |
| ------------------------- | ------------------------------------------------- | ---------------------------------- |
| `inboundFormDeliveryId`   | INTEGER PK autoincrement                          |                                    |
| `inboundFormSubmissionId` | INTEGER FK → submission, CASCADE                  |                                    |
| `inboundFormReceiverId`   | INTEGER NULL FK → receiver, SET NULL              | history survives receiver deletion |
| `inboundFormTemplateId`   | INTEGER NULL FK → template version used, SET NULL |                                    |
| `emailFrom`               | VARCHAR(255) NOT NULL                             | resolved literal                   |
| `emailTo`                 | VARCHAR(255) NOT NULL                             | resolved literal                   |
| `status`                  | VARCHAR(255) NOT NULL                             | `pending \| sent \| failed`        |
| `error`                   | TEXT NULL                                         | failure detail                     |
| `sentAt`                  | DATE NULL                                         |                                    |
| `createdAt` / `updatedAt` | DATE NOT NULL                                     |                                    |

## Backend — MailModule (`apps/backend/src/modules/mail/`)

The seam for the future public send-API. No controller in this iteration.

- **`MailService.sendMail({ from, to, replyTo?, subject, html })`**
    1. Extract the domain from `from`.
    2. Look up the domain and its active DKIM key (new export from `DomainModule`); decrypt the
       private key via `DkimEncryptionService`.
    3. Send through a Nodemailer SMTP transport with Nodemailer's `dkim` option
       (`domainName = form domain fqdn`, stored selector, decrypted key).
    4. Unknown domain / missing DKIM → typed error for the caller.
- **Transport** built from new env keys: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, optional
  `SMTP_USER` / `SMTP_PASSWORD`. Dev `.env` points at MailHog (`localhost:1025`).
- **`TemplateRendererService`** — thin Handlebars wrapper: compile + render, HTML escaping on by
  default, compile/render errors surfaced as typed errors.
- **`DomainModule`** gets its first `exports`: a domain-by-fqdn lookup including the active DKIM
  key, plus decryption access for `MailService`.
- New deps: `nodemailer`, `@types/nodemailer`, `handlebars`.

## Backend — InboundFormModule additions

### Services

- **`InboundFormService`** — form CRUD; bulk field upsert (matched by `key`: update existing,
  insert new, delete missing); bulk security replace; receiver CRUD. Save-time rules:
    - `emailFrom` must belong to the form's domain (`*@<domain.fqdn>`); receivers require the form to
      have a domain.
    - `{{placeholder}}` in `emailReceiver` / `emailReplyTo` must reference an existing `EMAIL` field.
    - Security type must be unique per form; `CSRF` is rejected.
    - Slug: kebab-case validation, unique.
    - Field bulk upsert rejects removing (or re-typing away from `EMAIL`) a field that a receiver
      placeholder still references.
    - `PATCH` with a changed `domainId` re-validates all receivers' `emailFrom` against the new
      domain and rejects on mismatch.
- **`InboundFormTemplateService`** — `saveDraft` (update the existing draft in place, or insert at
  `maxVersion + 1`), `publish` (draft → published, transactional; requires non-empty subject and
  template and a syntactically valid Handlebars body), newest-published lookup, version list.
- **`InboundFormSecurityService`** — one strategy per scheme type. Extraction per configured
  location (body `security` object / header / query, addressed by `key`).
    - Honeypot: value must be empty/null → otherwise flag submission `spam` (still respond success).
    - reCAPTCHA: `fetch` POST to Google `siteverify` with the row's `config.secret`; require
      `success === true` and, when `minScore` is set, `score >= minScore`; failure → `403`.
- **`InboundFormSubmissionService`** — public flow orchestration:
    1. Resolve active form by slug (404 if missing/inactive).
    2. Run security chain.
    3. Validate `data` with a dynamically built Zod schema from the field definitions (type map,
       `required`, constraints; unknown keys stripped; `defaultValue` applied). New backend dep: `zod`.
    4. Persist submission (+ `pending` delivery row per active receiver with a published template).
    5. Respond `201`.
    6. Fire-and-forget (`void promise.catch(...)`): per delivery, resolve recipient placeholders,
       render subject + body via `TemplateRendererService`, call `MailService.sendMail`, set the
       delivery row to `sent`/`failed` (+ `error`, `sentAt`), log failures.

### Controllers

- **`InboundFormController`** (`/inbound-form`, `@JwtAuth`, tag `inbound-form`):
    - `POST /` — create `{ name, slug, domainId? }`
    - `GET /` — list
    - `GET /:inboundFormId` — full form (fields, security, receivers incl. template summary:
      draft/published versions)
    - `PATCH /:inboundFormId` — `{ name?, slug?, domainId?, isActive? }`
    - `DELETE /:inboundFormId`
    - `PUT /:inboundFormId/fields` — bulk upsert array
    - `PUT /:inboundFormId/security` — bulk replace array
    - `POST /:inboundFormId/receiver`, `PATCH|DELETE /:inboundFormId/receiver/:receiverId`
    - `GET /:inboundFormId/receiver/:receiverId/template` — version list (incl. bodies, for rollback)
    - `PUT /:inboundFormId/receiver/:receiverId/template/draft` — `{ subject, template }`
    - `POST /:inboundFormId/receiver/:receiverId/template/publish`
    - DTOs follow house conventions (`@ApiProperty`, static `fromX` mappers, `@ResponseDto`).
- **`PublicInboundFormController`** (`POST /public/form/:slug`, no `@JwtAuth`, tag `public-form`):
  request/response per the contract above. Open CORS. `ThrottlerModule` registered in `AppModule`;
  `ThrottlerGuard` applied only to this controller (per-IP, default ~10/min). New dep:
  `@nestjs/throttler`.
- No template-preview endpoint — the frontend renders previews client-side with the same
  Handlebars version.
- No submissions-list endpoint yet (data model supports a future dashboard).

After the backend lands: `pnpm --filter backend generate` then `pnpm --filter api build`.

## Frontend — new module `apps/frontend/src/modules/inbound-forms/`

Routes added to `RouteNames` + router, nav entry in `AppLayout`:

- **List** (`/forms`, `INBOUND_FORM_LIST`): name, slug, domain, active state, copy button for
  `{origin}/api/public/form/{slug}`. Add-dialog: name, slug (auto-kebab from name, editable),
  domain select via existing `useDomainsQuery`.
- **Detail — the setup page** (`/forms/:inboundFormId`, `INBOUND_FORM_DETAILS`), one card per concern:
    - _General_: name, slug, domain select, active switch, endpoint URL + copy.
    - _Fields_: rows (key, label, type, required, default, per-type constraints), add/edit via
      dialog, saved through the bulk `PUT`.
    - _Security_: scheme list; add-dialog with type (reCAPTCHA/honeypot), location
      (body/header/query), key, and for reCAPTCHA secret + min score.
    - _Receivers_: per receiver `emailFrom` (suffix-validated against the form's domain), recipient
      combobox (literal address or `{{field}}` chip from `EMAIL` fields), optional reply-to, active
      switch, template status chip (none/draft/published + version), "Edit template" button, delete.
- **Template editor** (`/forms/:inboundFormId/receiver/:receiverId/template`,
  `INBOUND_FORM_TEMPLATE`): toolbar (back, save draft, publish, version-history menu), subject
  input, field-chip row (click inserts `{{key}}` at cursor), split pane:
    - Monaco with the built-in `handlebars` language + a completion provider suggesting field keys
      after `{{`. Workers wired via `?worker` imports in the Vite config. Dep: `monaco-editor`.
    - Live preview: sandboxed `srcdoc` iframe (no scripts), re-rendered debounced (~300 ms) with
      client-side Handlebars and sample data derived from field types (email →
      `jane.doe@example.com`, number → 42, …). Dep: `handlebars`.
    - Rollback: pick an old version from history → loads into the editor → save draft.
    - Editor helpers (sample-data generation, placeholder insertion) are plain functions, kept
      testable outside Monaco.

Server state follows the house pattern: `useInboundFormsQuery`, `useInboundFormQuery`,
`useTemplateVersionsQuery`, one mutation composable per endpoint; keys rooted at
`['inboundForms']`; cache maintenance via `setQueryData` / invalidation. Copy under
`inboundForms.*` in `src/locales/en.json`; dialog validation via vee-validate + Zod with
`validation.*` keys.

## Testing

- **Backend unit** (Vitest + SWC, typed `vi.fn` doubles per house rules):
    - Security strategies (mocked `fetch` for siteverify; honeypot semantics).
    - Dynamic Zod schema builder (types, required, constraints, stripping, defaults).
    - Template versioning (draft-in-place, publish, single-draft rule, newest-published).
    - Submission orchestration with mocked `MailService` (delivery status transitions, error capture).
    - `MailService` with mocked Nodemailer transport (asserts DKIM domain/selector/key and envelope).
    - Controller specs mirroring `domain.controller.spec.ts`.
- **Backend e2e** (Testcontainers): full journey — create form, configure fields/security/receiver,
  publish template, POST the public endpoint, assert submission + delivery rows. A MailHog
  container joins the e2e global setup; the test asserts via MailHog's HTTP API that the message
  arrived with a DKIM signature header.
- **Frontend**: query/mutation specs via `withVueQuery`; setup-page spec via `mountView` with
  mocked `api`; editor pure helpers unit-tested; Monaco stubbed in jsdom.

## Env additions (root `.env`)

```
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
```

## Out of scope (explicitly deferred)

- Public send-email API for other backends (future task; `MailModule` is its landing zone).
- CSRF security scheme implementation.
- Submissions dashboard/UI and retry of failed deliveries (data model already supports both).
- Encrypting the reCAPTCHA secret at rest.
- Durable send queue (BullMQ) — revisit if fire-and-forget proves lossy in practice.
