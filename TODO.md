# TODO

## Inbound forms

- [ ] **Per-form rate limit overrides.** Let each inbound form override the submit and token throttler limit/TTL (nullable columns on the form, editable on the form detail page). The env values become the fallback, so rename them accordingly: `FORM_SUBMIT_RATE_LIMIT` → `FORM_SUBMIT_DEFAULT_RATE_LIMIT`, `FORM_SUBMIT_RATE_TTL` → `FORM_SUBMIT_DEFAULT_RATE_TTL`, `FORM_TOKEN_RATE_LIMIT` → `FORM_TOKEN_DEFAULT_RATE_LIMIT`, `FORM_TOKEN_RATE_TTL` → `FORM_TOKEN_DEFAULT_RATE_TTL` (`env.schema.ts`, `.env.example`, `app.module.ts`). Today the `formSubmit`/`formToken` throttlers in `app.module.ts` read static values, so resolving the limit per form requires a lookup by slug at request time (resolver functions for `limit`/`ttl` or a custom guard).
