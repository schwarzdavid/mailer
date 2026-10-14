# Public Send API — Design

Date: 2026-10-14
Status: Approved by owner (design dialogue); pending spec review

## Goal

Let customers send email through an API-key-authenticated HTTP endpoint, scoped to a
project and its domains. Every outbound mail — from the API and from inbound forms —
is recorded in one central message log per project.

## Context

- `MailService.sendMail` already performs the block-list check, DKIM signing for the
  sending domain, the bounce envelope, and recording of synchronous SMTP 5xx rejections.
- Projects own domains via `project_domains`; project members hold `read` / `update` /
  `delete` permissions, enforced by `assertProjectReadable` / `assertProjectUpdatable`.
  Projects are soft-deleted (`paranoid`).
- Inbound forms log per-receiver sends in `inbound_form_deliveries` (status, error,
  sentAt). Inbound forms belong to a project (`inbound_forms.projectId`).
- `createOpenApiDocument` already declares an `apiKey` security scheme (`?key=` query),
  currently unused.
- Throttling uses `@nestjs/throttler` with the Redis-backed `FailOpenThrottlerStorage`.

## Decisions (from design dialogue)

1. **Key scope:** per project. A key may only send `from` addresses on its project's
   domains. Members with project `update` manage keys; `read` lists them.
2. **Delivery:** synchronous send inside the request, plus a persisted message log.
   No queue, no retries (the SMTP relay already retries transient failures).
3. **Log structure:** a central `mail_messages` table written by `MailService` for
   every send; `inbound_form_deliveries` gains a `mailMessageId` FK and keeps its
   form-specific columns.
4. **No message body is stored** — subject and envelope metadata only.
5. **Payload v1:** `from`, single `to`, optional `replyTo`, `subject`, `html`, optional
   `text`. No cc/bcc, attachments, custom headers, or templates.
6. **Key transport:** accepted from `Authorization: Bearer <key>` **or** the `key` query
   parameter. Header wins if both are present. Only a hash is stored.
7. **UI deferred:** a design rework is in progress in a separate effort. All frontend
   work for this feature (key management, message log) is out of scope here and will be
   planned in detail after the rework lands. This spec delivers backend + the
   regenerated `api` client only.

## Backend

### Data model — migration `014-create-api-keys-and-mail-messages.ts`

**`api_keys`** (new module `apps/backend/src/modules/api-key/`)

| Column | Type | Notes |
|---|---|---|
| `apiKeyId` | serial PK | |
| `projectId` | int FK → `projects`, `ON DELETE CASCADE` | |
| `name` | varchar(100) | human label |
| `prefix` | varchar(16), unique | e.g. `sdm_a1b2c3d4`, shown in lists and used for lookup |
| `secretHash` | char(64) | hex SHA-256 of the full key |
| `createdByUserId` | int FK → `users`, `ON DELETE SET NULL`, nullable | |
| `lastUsedAt` | timestamptz, nullable | |
| `revokedAt` | timestamptz, nullable | soft revoke |
| `createdAt` / `updatedAt` | timestamptz | |

Key format: `sdm_<8 random base62 chars>_<32 random bytes, base64url>`. The `prefix`
column holds `sdm_<8 chars>`. SHA-256 (not bcrypt) is sufficient because the secret is
high-entropy random data, not a user-chosen password.

**`mail_messages`** (owned by the `mail` module)

| Column | Type | Notes |
|---|---|---|
| `mailMessageId` | serial PK | |
| `projectId` | int FK → `projects`, `ON DELETE SET NULL`, nullable | |
| `source` | enum `api` \| `inbound_form` | |
| `apiKeyId` | int FK → `api_keys`, `ON DELETE SET NULL`, nullable | set for `api` |
| `emailFrom` | varchar(320) | |
| `emailTo` | varchar(320) | |
| `subject` | varchar(998) | |
| `status` | enum `pending` \| `sent` \| `failed` \| `blocked` | |
| `error` | text, nullable | |
| `smtpMessageId` | varchar(998), nullable | nodemailer `info.messageId`, for future bounce correlation |
| `sentAt` | timestamptz, nullable | |
| `createdAt` / `updatedAt` | timestamptz | |

Indexes: `(projectId, mailMessageId DESC)`, `(smtpMessageId)`.

**`inbound_form_deliveries`**: add `mailMessageId` int FK → `mail_messages`,
`ON DELETE SET NULL`, nullable. No backfill.

### MailService changes

- `SendMail` gains optional `text?: string`, passed through to nodemailer.
- New context parameter:
  ```ts
  interface SendMailContext {
      projectId: number | null
      source: MailMessageSource
      apiKeyId?: number
  }
  sendMail(mail: SendMail, context: SendMailContext): Promise<SentMail>
  interface SentMail { mailMessageId: number; smtpMessageId: string }
  ```
- Flow:
  1. Insert `mail_messages` row with `status: pending`.
  2. `assertNotBlocked` throws `EmailBlockedException` → update row to `blocked`
     (error = message), rethrow.
  3. Domain / DKIM resolution errors → row `failed`, rethrow.
  4. Transport error → existing `recordRejection`, row `failed` with error, rethrow.
  5. Success → row `sent`, `smtpMessageId`, `sentAt`; return `SentMail`.
- Failures to update the log row are logged and never mask the original outcome.
- Row writes go through a new `MailMessageService` (`mail/services/`), which also serves
  list queries. Model + interface live in `mail/models/` and `mail/interfaces/`.

### Inbound form changes

`InboundFormSubmissionService.processDelivery` passes
`{ projectId: form.projectId, source: 'inbound_form' }` and stores the returned
`mailMessageId` on the delivery row on success. On failure the delivery still records
`FAILED`; the `mailMessageId` of the failed attempt is attached as well — `sendMail`
attaches it to the thrown error via a `MailSendError` wrapper carrying `mailMessageId`
(and preserving the original as `cause`). `PendingDelivery` needs the form's
`projectId`, which the submission flow already loads.

### API key module (`modules/api-key/`)

- `models/api-key.model.ts`, `interfaces/api-key.interface.ts` (public shape without
  `secretHash`), `mappers/api-key.mapper.ts` (strips `secretHash` — single chokepoint, as
  `user.mapper.ts`).
- `services/api-key.service.ts`:
  - `createKey(projectId, name, principal, ability)` → `{ apiKey, key }`; asserts
    `assertProjectUpdatable`.
  - `listKeys(projectId, ability)`; asserts `assertProjectReadable`.
  - `revokeKey(projectId, apiKeyId, ability)`; asserts updatable; idempotent.
  - `authenticate(rawKey)` → `ApiKey | null`: parse format, look up by prefix, constant-
    time compare (`crypto.timingSafeEqual`) of hashes, reject revoked keys and keys whose
    project is soft-deleted.
  - `touchLastUsed(apiKeyId)`: fire-and-forget, gated by a Redis key
    `api-key:last-used:<id>` with 60 s TTL so at most one write per minute per key.
- `guards/api-key-auth.guard.ts`: extracts the key (Bearer header first, then `key`
  query), calls `authenticate`, attaches the key to `request.apiKey`, 401 otherwise.
- `decorators/api-key-principal.decorator.ts`: `@ApiKeyPrincipal()` returns
  `request.apiKey` (401 if absent).
- `decorators/api-key-auth.decorator.ts`: `@ApiKeyAuth()` composes `@Public()` (so the
  JWT guard skips), `UseGuards(ThrottlerGuard, ApiKeyAuthGuard)` and the Swagger
  security requirements.

### HTTP API — public send (`PublicSendController`, tag `public-send`)

`POST /api/v1/send` with `@ApiKeyAuth()`.

Request `PublicSendDto`: `from` (`IsEmail`), `to` (`IsEmail`), `replyTo?` (`IsEmail`),
`subject` (1–998 chars), `html` (1 – 1 MB), `text?` (≤ 1 MB).

Response `202` `PublicSendResultDto`: `{ mailMessageId, status: 'sent' }`.

`PublicSendService.send(apiKey, dto)`:
1. Split `from`; resolve the domain by FQDN; require it to be assigned to
   `apiKey.projectId` → else 403 `FROM_DOMAIN_NOT_ALLOWED`.
2. Require a verified sending domain with active DKIM → else 422
   `FROM_DOMAIN_NOT_READY`.
3. `mailService.sendMail(..., { projectId, source: 'api', apiKeyId })`.
4. Map errors:

| Case | HTTP | Log row |
|---|---|---|
| Missing / malformed / unknown / revoked key | 401 | none |
| `from` domain not in project | 403 `FROM_DOMAIN_NOT_ALLOWED` | none |
| Domain not verified / no DKIM | 422 `FROM_DOMAIN_NOT_READY` | none |
| Recipient blocked | 422 `RECIPIENT_BLOCKED` | `blocked` |
| SMTP / relay failure | 502 `DELIVERY_FAILED` + `mailMessageId` | `failed` |
| Rate limit exceeded | 429 | none |

Error bodies use Nest's standard shape with an added `code` field.

Rate limiting: `@Throttle` with a tracker returning `api-key:<prefix>` (taken from the raw
key before authentication, so invalid keys are throttled too), limits from env.

### HTTP API — management (`ApiKeyController`, `@JwtAuth`, tag `api-key`)

- `GET /api/project/:projectId/api-keys` → `ApiKeyDto[]` (`apiKeyId`, `name`, `prefix`,
  `createdByUserId`, `lastUsedAt`, `revokedAt`, `createdAt`).
- `POST /api/project/:projectId/api-keys` body `{ name }` → `ApiKeyCreatedDto`
  (`ApiKeyDto` + `key`, returned exactly once).
- `DELETE /api/project/:projectId/api-keys/:apiKeyId` → 204.

### HTTP API — message log (`MailMessageController`, `@JwtAuth`, tag `mail-message`)

- `GET /api/project/:projectId/messages?limit=50&before=<mailMessageId>&source=&status=`
  → `MailMessageDto[]`, newest first, `limit` max 100. Asserts `assertProjectReadable`.

### Swagger

Keep the existing `apiKey` query scheme (`name: key`) and add a second scheme for the
header (`type: http`, `scheme: bearer`, `bearerFormat: 'sdm_…'`, name `api-key`). Only
`POST /v1/send` declares them. The `v1` segment is the public API's versioning
anchor; internal routes stay unversioned.

## Configuration

Added to `envSchema` (with defaults) and `.env.example`:

| Key | Default | Purpose |
|---|---|---|
| `PUBLIC_API_RATE_LIMIT` | `60` | requests per window per key |
| `PUBLIC_API_RATE_TTL` | `60000` | window in ms |

## New dependencies

None.

## Testing

Backend unit (`*.spec.ts`, typed `vi.fn<Service['method']>()` doubles):
- `ApiKeyService`: key format, hash-only storage, authenticate (valid, wrong secret,
  unknown prefix, revoked, deleted project), revoke idempotency, ability checks,
  `touchLastUsed` throttling.
- `ApiKeyAuthGuard`: header, query, header precedence, malformed, missing.
- `PublicSendService`: domain-scope check, not-ready domain, error mapping.
- `MailService`: log row transitions for sent / failed / blocked / domain error;
  `text` passthrough; log-write failure does not mask outcome.
- `MailMessageService`: pagination and filters.
- `InboundFormSubmissionService`: passes context, stores `mailMessageId` on success and
  failure.
- `env.schema.spec.ts`: new keys and defaults.

Backend e2e (`test/public-send.e2e-spec.ts`):
- create key via management endpoint → send via header → 202, `sent` row visible via
  messages endpoint; `lastUsedAt` set.
- send via `?key=` → 202.
- revoked key → 401; malformed key → 401.
- `from` on a domain of another project → 403.
- blocked recipient → 422 and `blocked` row.
- exceeding the rate limit → 429.
- member with only `read` cannot create or revoke keys (403).
- existing inbound-form e2e: delivery carries a `mailMessageId`.

After backend changes: `pnpm --filter backend generate` and `pnpm --filter api build`,
then `pnpm check`.

## Documentation

README: add a "Public send API" section with a curl example; update the open todo to
note the backend is done and the UI is pending the design rework.

## Out of scope

- All frontend / UI work (deferred until after the design rework).
- Queueing, retries, scheduled sends.
- Multiple recipients, cc/bcc, attachments, custom headers, templates via API.
- Storing message bodies.
- Key scopes or expiry beyond project binding and manual revoke.
- Backfilling `mail_messages` from historic `inbound_form_deliveries`.
- Correlating bounces to `mail_messages` (enabled by `smtpMessageId`, done with VERP work).
