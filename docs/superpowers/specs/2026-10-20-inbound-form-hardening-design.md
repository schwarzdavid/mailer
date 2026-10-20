# Inbound Form Hardening — Design

Date: 2026-10-20
Status: Approved by owner (design dialogue), builder-checked

## Goal

Public inbound forms (`POST /api/public/form/:slug`) are protected against bots by a
honeypot and, optionally, Google reCAPTCHA. They are not protected against a visitor (or
crawler) copying the endpoint and replaying requests from Postman or a script, and not
against foreign websites embedding the endpoint for their own visitors. The primary harm
is spam delivered to the form's receivers. The system is not live yet, so data
migrations may be rewrites rather than gentle transitions.

A public form can never fully prevent a replayed request — anything a browser sends, a
script can send. The goal is to make every submission cost something (a fresh,
time-delayed, single-use token bound to an IP; captcha), to bind forms to the owner's
websites, and to cap the damage with limits.

## Context

- Security schemes live in `inbound_form_security` (one row per type per form:
  `type`, `location` body/header/query, `key`, JSONB `config`). Types today:
  `google-recaptcha`, `honeypot`, and a placeholder `csrf` that `replaceSecurity`
  rejects. `InboundFormSecurityService.checkSubmission` runs honeypots first (hit →
  stored as `SPAM`, silently accepted), then reCAPTCHA (failure → 403).
- reCAPTCHA verification checks `success` and `minScore`, but ignores the `hostname`
  and `action` fields of Google's response.
- `PublicInboundFormController` uses `ThrottlerGuard` with only the global default
  throttler (10 req/min per IP across the app). Throttler storage is Redis
  (`FailOpenThrottlerStorage`, ioredis client `THROTTLER_REDIS_CLIENT`).
- `app.enableCors()` is global and permissive. `TRUST_PROXY` drives `req.ip`.
- `exampleForm.ts` generates a plain `<form action method="post">` snippet and only
  renders honeypots with `location === 'body'`.
- Forms already carry `domainId` (sending domain), unrelated to where the form is
  embedded.

## Decisions (from design dialogue)

1. **Allowed hostnames are a form-level setting**, not a security scheme. One list per
   form is the single source of truth for every hostname-related check: the Origin
   check on submit, token issuance, and the hostname check of every captcha provider.
2. **reCAPTCHA is hardened**: response `hostname` is checked against the form's list;
   an optional expected `action` is configurable.
3. **New scheme: time-delayed token** (replaces the `csrf` placeholder, which is
   removed — classic CSRF protects sessions and does not apply to anonymous forms).
   The token is issued by the backend, only becomes valid after a minimum delay, is
   single-use, short-lived, and bound to the requesting IP. No long-held connection
   (WebSocket/SSE) — it adds nothing over a not-before timestamp and invites
   connection-exhaustion attacks.
4. **Rate limits**: per IP and form on submit, per IP and form on token issuance.
5. **Honeypot location is fixed to `body`.** Header/query honeypots can never trigger.
6. **Additional captcha providers** (hCaptcha, Turnstile, ALTCHA) are out of scope, but
   the structure must let them be added as further scheme types that reuse the
   hostname list.

## Design

### 1. Allowed hostnames

- New column `inbound_forms.allowedHostnames` (`TEXT[]`, not null, default `{}`),
  exposed on `InboundForm`, `InboundFormDto`, and the form update DTO.
- Entries are bare hostnames (`kunde.at`, `www.kunde.at`), lowercased and trimmed,
  validated as hostnames, deduplicated. Exact match only — no wildcards, no scheme,
  no port, no path. `localhost` is allowed (local development of the customer site).
- **Submit check** (new first step of `checkSubmission`, before honeypots): when the
  list is non-empty, the request's hostname is taken from the `Origin` header, falling
  back to `Referer` if `Origin` is absent. A missing, `null`, unparseable, or
  non-listed hostname → `403 Forbidden` ("Origin not allowed"). The submission is not
  stored. When the list is empty, no check runs.
- **CORS is left as is** (my call). CORS only controls whether the browser may read
  the response; it never stops the request reaching the server. The server-side check
  is the enforcement, so per-form CORS reflection would add complexity without
  protection.
- **Admin UI**: the Security card on the form detail view gets an "Allowed domains"
  block above the scheme list, editable through a small dialog (chip/combobox input),
  persisted via the existing form update endpoint. With an empty list the card shows a
  warning that the form accepts submissions from any website.

### 2. reCAPTCHA hardening

- `InboundFormRecaptchaStoredConfig` / config input DTOs gain optional
  `expectedAction?: string` (max 100 chars).
- `verifyRecaptcha` additionally:
    - when the form's `allowedHostnames` is non-empty, requires the response
      `hostname` to be in it → else 403 "Captcha hostname mismatch";
    - when `expectedAction` is set, requires response `action === expectedAction` →
      else 403 "Captcha action mismatch".
- `checkSubmission` therefore needs the form's allowed hostnames; pass them in the
  context (e.g. `context.allowedHostnames`) rather than re-querying.
- Security dialog: an "Expected action" text field for reCAPTCHA, with a hint that it
  applies to v3.
- Future captcha providers follow the same pattern: provider-specific config on the
  scheme, hostname check sourced from the form.

### 3. Honeypot location fixed to `body`

- `replaceSecurity` rejects a honeypot with `location !== 'body'` (400).
- Security dialog: for type honeypot, the location select is hidden and the value is
  `body`.
- Migration rewrites existing honeypot rows to `location = 'body'`.

### 4. Time-delayed token scheme

**Type**: `InboundFormSecurityType.TIMED_TOKEN = 'timed-token'`. `CSRF` is removed from
the enum; the migration deletes any `csrf` rows (none can exist, `replaceSecurity`
rejects them, but the delete keeps the enum change safe). `location` and `key` work as
for reCAPTCHA (body/header/query; default key `formToken` in the dialog).

**Config** (JSONB on the scheme row): `minDelaySeconds` (integer 1–60, default 3) and
`maxAgeSeconds` (integer 60–86400, default 3600). Config is a per-type shape; the
interface's `config` becomes a union of the reCAPTCHA and timed-token configs (DTOs
likewise, discriminated by `type`).

**Precondition**: a form with a timed-token scheme must have a non-empty
`allowedHostnames` list. `replaceSecurity` rejects adding the scheme to a form without
hostnames; the form update rejects clearing the list while the scheme exists (both
400). Otherwise any site could fetch tokens.

**Issuance**: `POST /api/public/form/:slug/token` (POST so nothing caches it), public.

- 404 if the form is unknown/inactive or has no timed-token scheme.
- Origin check exactly as in §1 (list is guaranteed non-empty) → 403.
- Rate-limited per IP + slug (default 5 per 10 min; env
  `FORM_TOKEN_RATE_LIMIT` / `FORM_TOKEN_RATE_TTL`) via a named throttler with a
  custom tracker, so parallel token hoarding from one IP is capped.
- Response `{ token: string, notBefore: string (ISO), expiresAt: string (ISO) }`.

**Token format** (my call): `base64url(payload).base64url(hmac)` where payload is
`{ f: inboundFormId, n: 128-bit random nonce, iat: epoch seconds, ip: sha256(req.ip) }`
and the HMAC-SHA256 key is derived from `BACKEND_ENCRYPTION_SECRET` with HKDF and a
fixed info string (`inbound-form-token`), so no new env secret is needed. Stateless
until consumption.

**Verification** (in `checkSubmission`, after honeypots, before reCAPTCHA): missing
value, bad signature, form mismatch, IP-hash mismatch, `now < iat + minDelaySeconds`,
or `now > iat + maxAgeSeconds` → 403. This step is stateless. The nonce is consumed
only after reCAPTCHA and field validation have passed, right before the submission is
stored (my call — a typo or failed captcha must not burn the token): atomically in Redis
(`SET inbound-form-token:<nonce> 1 NX EX <maxAgeSeconds>` on the ioredis client);
already present → 403 "Token already used". If Redis is unavailable the check
**fails closed** (403) — unlike the throttler, this check is the protection itself
(my call).

IP binding means a visitor whose IP changes between token fetch and submit (mobile
network switch) is rejected; accepted trade-off, a retry fetches a fresh token.

**Not a default** (owner decision): new forms get no timed-token scheme and no client
script; the owner adds the scheme manually in the Security dialog, and the website
integrator adds the script manually following the info dialog (§6).

**Client script — only for the timed-token scheme.** How a form is submitted is the
job of whoever builds the customer's website (owner decision); the product does not
ship a form-submitting script and no longer offers a native-HTML embed (today's HTML
snippet cannot work: bare field names vs. the `{ data, security }` body with
`forbidNonWhitelisted`, and string values vs. strict number/boolean fields). The
script exists solely to obtain a valid token. The backend serves a static vanilla-JS
file at `GET /api/public/form/client.js` (long `Cache-Control`,
`application/javascript`). It:

- derives the API base from its own `src` and exposes one global function,
  `InboundForm.getToken(slug): Promise<string>`;
- fetches the token on the first call (the integrator calls it lazily, e.g. on first
  focus of the form, or simply at submit time — not on page load, so a form in a
  site-wide footer does not burn the issuance limit) and caches it per slug; the
  returned promise resolves only once `notBefore` has passed, so calling it at submit
  time automatically waits out the remaining delay;
- drops the cached token once it has been handed out, so the next call (e.g. a retry
  after a failed submit) fetches a fresh one;
- rejects the promise with the HTTP status on issuance errors (403/404/429).
- Putting the token into the request (body `security[key]`, header, or query param)
  is the integrator's job; the info dialog (§6) shows how.
- No build step: plain ES2019 JS shipped as an asset, unit-tested in jsdom.

**Example request** (replaces `exampleForm.ts` in `EndpointCard`): the endpoint card
shows a `fetch` call instead of HTML: `POST <endpoint>` with
`Content-Type: application/json` and a body `{ data: { … } }` filled with sample values
per field type (text → placeholder string, email → `"max@example.com"`, number → `42`,
boolean → `true`), in field order. No security values are included by default (owner
decision) — each scheme documents its own part in its info dialog.

### 6. Integration info dialogs per security scheme

Each security scheme row in the Security card gets an info action that opens a
read-only dialog explaining what the scheme does and how to integrate it, with
copyable code built from the scheme's actual `location` and `key` and the form's
endpoint:

- **Honeypot**: short explanation (hidden field that humans leave empty and bots fill;
  hits are stored as spam and answered with success so bots learn nothing), plus an
  HTML form with the hidden input (`tabindex="-1" autocomplete="off"`, hidden via CSS
  rather than `type="hidden"`, which bots skip) and the fetch body showing its value
  under `security.<key>`.
- **reCAPTCHA**: explanation; snippet loading Google's script with a `SITE_KEY`
  placeholder (the site key is not stored), `grecaptcha.execute(SITE_KEY, { action })`
  using the configured expected action if set, and the token placed per location/key;
  note that the website's domain must be in the form's allowed domains and in the
  reCAPTCHA admin console.
- **Timed token**: explanation (minimum delay, single use, IP-bound, requires allowed
  domains); `<script src="<api>/public/form/client.js">` include and a submit handler
  calling `InboundForm.getToken('<slug>')` and placing the token per location/key;
  note to retry with a fresh token on 403.
- Snippet builders are pure helpers under `inbound-forms/helpers/` (replacing
  `exampleForm.ts`) and are unit-tested.

### 7. Rate limits on submit

- Submit endpoint gets a named throttler keyed on IP + slug (default 5 per 10 min; env
  `FORM_SUBMIT_RATE_LIMIT` / `FORM_SUBMIT_RATE_TTL`), in addition to the global one.
  New env keys go into `envSchema` with defaults and into `.env.example`.
- A per-form hourly cap across all IPs was discussed; **deferred** (my call) — the
  per-IP limits plus token issuance limit bound a single source, and a global cap lets
  an attacker lock out real visitors. Can follow as a form setting later.

### Check order on submit

1. Form lookup (404)
2. Origin / allowed hostnames (403, not stored)
3. Honeypot (stored as `SPAM`, 200)
4. Timed token signature/timing/IP (403, stateless)
5. reCAPTCHA incl. hostname/action (403)
6. Field validation (400)
7. Token nonce consumption (403 if already used), then storage and delivery as today.

Throttling happens in the guard before all of this.

## Migration

One migration `017-harden-inbound-forms.ts`:

- add `inbound_forms."allowedHostnames" TEXT[] NOT NULL DEFAULT '{}'`;
- `UPDATE inbound_form_security SET location = 'body' WHERE type = 'honeypot'`;
- `DELETE FROM inbound_form_security WHERE type = 'csrf'`;
- `down` drops the column (honeypot/csrf changes are not reverted).

## Testing

- Unit: hostname normalization/validation; Origin/Referer extraction; token sign/verify
  (each rejection reason, clock injected); nonce consumption incl. Redis failure;
  reCAPTCHA hostname/action; `replaceSecurity` rules (honeypot location,
  timed-token precondition, csrf gone); form update guard on clearing hostnames;
  client script in jsdom (lazy fetch, waits until `notBefore`, fresh token after
  hand-out, rejects with status).
- Frontend: Security card hostname block + warning, dialog honeypot location hidden,
  reCAPTCHA action field, timed-token config fields, example fetch request, the three
  info dialogs and their snippet builders (location/key variants).
- E2E: allowed origin passes, foreign/missing origin 403; token flow happy path, too
  early, reused, wrong IP not feasible in e2e → unit only; throttle on token issuance.
- Regenerate the API client (`pnpm --filter backend generate`, `pnpm --filter api build`)
  and run `pnpm check`.

## Out of scope

- hCaptcha, Turnstile, ALTCHA / proof-of-work.
- Per-form global submission cap.
- Hosted form pages / iframe embedding.
- Native (no-JS) form submission: `data[...]` naming, urlencoded coercion, redirect /
  success pages. Submission is the integrator's job, shown via the fetch example.
- A product-provided form-submitting script.

## Left to the builder

- Exact placement of the token/origin helpers (new service vs. inside
  `InboundFormSecurityService`), naming of throttlers and Redis keys.
- Chip/combobox component choice for the hostname editor, following `src/components`.
- i18n key names under `module.inboundForms.details.security.*`.
