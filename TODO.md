# TODO

## Operations

- [ ] **Setup CLI.** A command run inside the container (`docker compose exec backend node dist/setup.js …`) that does the first-run setup without the web wizard: create the first super-admin (name, email, password via prompt or stdin) and, optionally, set the sending domain's server IPs. Once it exists, it can replace the setup token that the backend writes to its log on startup while no user exists (`SetupTokenService`, go-live Phase 2), so the web setup can be switched off in production.

## Inbound forms

- [ ] **Per-form rate limit overrides.** Let each inbound form override the submit and token throttler limit/TTL (nullable columns on the form, editable on the form detail page). The env values become the fallback, so rename them accordingly: `FORM_SUBMIT_RATE_LIMIT` → `FORM_SUBMIT_DEFAULT_RATE_LIMIT`, `FORM_SUBMIT_RATE_TTL` → `FORM_SUBMIT_DEFAULT_RATE_TTL`, `FORM_TOKEN_RATE_LIMIT` → `FORM_TOKEN_DEFAULT_RATE_LIMIT`, `FORM_TOKEN_RATE_TTL` → `FORM_TOKEN_DEFAULT_RATE_TTL` (`env.schema.ts`, `.env.example`, `app.module.ts`). Today the `formSubmit`/`formToken` throttlers in `app.module.ts` read static values, so resolving the limit per form requires a lookup by slug at request time (resolver functions for `limit`/`ttl` or a custom guard).

## Public send API

- [ ] **SendGrid-compatible send endpoint.** Add `POST /api/v3/mail/send` that accepts the SendGrid v3 mail-send payload so existing SendGrid client libraries work by pointing their base URL at this backend (`@sendgrid/client`: `setDefaultRequest('baseUrl', …)`, Python SDK: `host=`; verify per library). Reuse the existing API key auth (`Authorization: Bearer <key>`, same as SendGrid) and translate the payload in a new DTO onto `PublicSendService.send`. Mirror SendGrid's response: `202` with an empty body and the message id in the `X-Message-Id` header; validation errors as `400` with SendGrid's `{ errors: [{ message, field }] }` shape. Initial subset: `personalizations[].to` (plus `cc`/`bcc` once multiple recipients are supported; today `PublicSendDto` takes a single `to`), `from: { email, name }` (needs display-name support), `reply_to`, `subject`, `content[]` (`text/plain` → `text`, `text/html` → `html`). Reject unsupported fields (`attachments`, `template_id`, `dynamic_template_data`, `send_at`, `categories`, …) explicitly with `400` instead of silently ignoring them. SES compatibility is out of scope for now: SigV4 needs the plaintext secret, but API keys are stored hashed.
