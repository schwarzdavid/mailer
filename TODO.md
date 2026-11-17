# TODO

## Operations

- [ ] **Setup CLI.** A command run inside the container (`docker compose exec backend node dist/setup.js …`) that does the first-run setup without the web wizard: create the first super-admin (name, email, password via prompt or stdin) and, optionally, set the sending domain's server IPs. Once it exists, it can replace the setup token that the backend writes to its log on startup while no user exists (`SetupTokenService`, go-live Phase 2), so the web setup can be switched off in production.

## Documentation

- [ ] **Revise the operator docs (`apps/docs`).** Go through the pages for accuracy and gaps. Known gap: `operations/updating.md` only describes the full release-to-release update (backup, recorded revision and migrations, new `compose.yml`). It lacks the short path for a running stack that only needs the newest image of its current tag: `docker compose pull backend` + `docker compose up -d` (or `up -d --pull always`), what a pinned `IMAGE_TAG` changes, and that `up -d` alone (`--pull missing`) does not fetch a newer image.

## Inbound forms

- [ ] **Per-form rate limit overrides.** Let each inbound form override the submit and token throttler limit/TTL (nullable columns on the form, editable on the form detail page). The env values become the fallback, so rename them accordingly: `FORM_SUBMIT_RATE_LIMIT` → `FORM_SUBMIT_DEFAULT_RATE_LIMIT`, `FORM_SUBMIT_RATE_TTL` → `FORM_SUBMIT_DEFAULT_RATE_TTL`, `FORM_TOKEN_RATE_LIMIT` → `FORM_TOKEN_DEFAULT_RATE_LIMIT`, `FORM_TOKEN_RATE_TTL` → `FORM_TOKEN_DEFAULT_RATE_TTL` (`env.schema.ts`, `.env.example`, `app.module.ts`). Today the `formSubmit`/`formToken` throttlers in `app.module.ts` read static values, so resolving the limit per form requires a lookup by slug at request time (resolver functions for `limit`/`ttl` or a custom guard).

## Public send API

- [ ] **SendGrid-compatible send endpoint.** Add `POST /api/v3/mail/send` that accepts the SendGrid v3 mail-send payload so existing SendGrid client libraries work by pointing their base URL at this backend (`@sendgrid/client`: `setDefaultRequest('baseUrl', …)`, Python SDK: `host=`; verify per library). Reuse the existing API key auth (`Authorization: Bearer <key>`, same as SendGrid) and translate the payload in a new DTO onto `PublicSendService.send`. Mirror SendGrid's response: `202` with an empty body and the message id in the `X-Message-Id` header; validation errors as `400` with SendGrid's `{ errors: [{ message, field }] }` shape. Initial subset: `personalizations[].to` (plus `cc`/`bcc` once multiple recipients are supported; today `PublicSendDto` takes a single `to`), `from: { email, name }` (needs display-name support), `reply_to`, `subject`, `content[]` (`text/plain` → `text`, `text/html` → `html`). Reject unsupported fields (`attachments`, `template_id`, `dynamic_template_data`, `send_at`, `categories`, …) explicitly with `400` instead of silently ignoring them. SES compatibility is out of scope for now: SigV4 needs the plaintext secret, but API keys are stored hashed.

## Bounces

- [ ] **Link bounces to the mail that caused them.** Every mail uses the same return path `bounce@MAIL_HOSTNAME`, so a bounce names the recipient but not the project, form delivery or API request. A per-mail return path (VERP) would link a bounce to its **Sent mail** entry and let that entry show the bounce.
- [ ] **Remove old bounce records automatically.** Recorded bounces stay in the database for good; purge them after a retention period.
- [ ] **Clean up the bounce mailbox.** The poller marks processed reports as read and never deletes them, so the `mail-data` volume only grows. Delete processed reports after a while.

## Admin UI

- [ ] **Branding settings.** Colours and a logo for the admin UI and the setup wizard.

## Domains

- [ ] **Create a domain in one step.** Adding a domain (or creating the sending domain) stores the domain, its DKIM key and its DNS records in separate steps; a backend that stops between them leaves a domain without a DKIM key behind, which answers the send API with `422 FROM_DOMAIN_NOT_READY` until it is deleted and added again. Do it in one transaction.

- [ ] **DKIM key rotation.** `domains.activeDkimId` already points at one of possibly several `domain_dkim` rows, but no service or endpoint creates a second key or switches the active one. Add an action that generates a new key and its `s2._domainkey` record, switches `activeDkimId` once the record validates, and retires the old key after a grace period; it is also the only recovery from a lost `BACKEND_ENCRYPTION_SECRET` short of deleting and re-adding every domain.

## Deliverability

- [ ] **Blocklist / IP reputation checks.** Periodically check the sending server's public addresses (`MAIL_SERVER_IPV4`, `MAIL_SERVER_IPV6`) against DNS-based blocklists and show the result in the admin UI (e.g. on the settings page next to the read-only IPs), so an operator notices a listing before bounces pile up. Lookups are plain DNS queries of the reversed address under the list's zone (`4.3.2.1.zen.spamhaus.org`, nibble format for IPv6); `NXDOMAIN` means not listed, a `127.0.0.x` answer means listed, with the return code naming the sub-list. Candidate lists: Spamhaus ZEN (SBL/XBL/PBL/CSS), SpamCop (`bl.spamcop.net`), Barracuda (`b.barracudacentral.org`, needs a free registration of the querying resolver), Mailspike, PSBL, UCEPROTECT; optionally the domain lists Spamhaus DBL and SURBL/URIBL for `MAIL_HOSTNAME` and the sender domains. Make the list set configurable rather than hard-coded. Caveats: Spamhaus refuses queries arriving via public/open resolvers (Google, Cloudflare, …) and answers with `127.255.255.x` error codes, which must be reported as "check failed", not "listed"; heavier or commercial use needs a Spamhaus DQS key (optional env, then query `<key>.zen.dq.spamhaus.net`). Most lists don't support IPv6 yet. Run it as an `@Interval` job with `@OnOneInstance({ key: 'deliverability:blocklist-check' })` and `@WithoutOverlapping()`, at a low rate (hours, not minutes), store the last result per list, and document it plus any new env vars in `apps/docs`.
- [ ] **Guided DMARC tightening.** Every domain starts with `p=none`. Show in the admin UI, per domain (sender domains and the platform sending domain), when it is time for the next stage and walk the user through it: observe (`p=none`, optional `rua=` report address and the `_report._dmarc` authorisation record when the report mailbox is on another domain), after about four weeks without failures `p=quarantine`, after another two to four weeks `p=reject`. Warn that other services sending for the domain must sign with DKIM before leaving `p=none`. The DNS check already accepts any policy, so the expected DMARC value must follow the chosen stage. Today this lives only on `apps/docs/operations/deliverability.md`; shrink that section once the UI covers it.
- [ ] **IP warm-up guidance in the UI.** During the first weeks after installation (or after `MAIL_SERVER_IPV4`/`MAIL_SERVER_IPV6` change), show the warm-up schedule on the dashboard with today's recommended maximum next to the number of mails actually sent today (form deliveries and API sends across all projects), and hide it once the schedule is done. The schedule (20 per day on days 1–2 up to 4,000 on days 25–28, then at most doubling per week) is on `apps/docs/operations/deliverability.md`.

## Mailing lists

- [ ] **Mailing lists.** Let a project manage lists of subscribers and send one mail (a template) to every subscriber of a list. Needs: list and subscriber models (address, status `pending`/`subscribed`/`unsubscribed`/`bounced`, consent timestamp), import/export, and subscribing via an inbound form or the API with double opt-in (confirmation mail with a signed token) for GDPR. Every list mail carries `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) pointing at a public unsubscribe endpoint, which Gmail and Yahoo require from bulk senders, plus a per-recipient unsubscribe link usable in the template. Hard bounces and complaints must suppress the address automatically, which depends on linking bounces to the mail that caused them (VERP, see Bounces below). Send through a BullMQ queue, one job per recipient, with a configurable rate so a large list doesn't burn the IP reputation (ties in with the blocklist checks above and the IP warm-up); show per-campaign progress and results in the admin UI. Document the endpoints, the public unsubscribe flow and any new env vars in `apps/docs`.
