# Domain, Sending and Permission Fixes — Design

Date: 2026-11-02
Status: Approved by owner (chat, 2026-11-02): strict readiness, DMARC content check kept

## Goal

Fix the product issues that surfaced while writing the operator documentation (spec
`2026-10-23-user-docs-design.md`, ledger of that project), as the owner decided on 2026-11-02:

1. Remove the unused permission `bounces.block` ("Block addresses").
2. Refuse to send from a domain whose DNS records are not all valid; the send API answers
   `422 FROM_DOMAIN_NOT_READY`, an inbound-form delivery keeps retrying for its normal
   schedule (8 attempts, about two hours) and then fails.
3. Check SPF (and DMARC) records by content instead of by exact string match, so one merged SPF
   record per name is accepted and several SPF records are rejected; the admin UI proposes the
   merged SPF value when the name already has an SPF record.
4. Anchor inbound-form field patterns in the backend so "the whole value must match" is true.
5. Refuse to start when `MAIL_HOSTNAME` changes to a name under the registrable domain of an
   existing customer domain, before anything is deleted.
6. Log `describeError(error)` instead of `error.message` in the bounce mailbox poller and the
   settings service.
7. Record the missing DKIM key rotation as a todo (no code change).

The documentation site (`apps/docs`) is updated in the same change, as `CLAUDE.md` requires.

## Context

- Permissions: `apps/backend/src/modules/permission/permission.constants.ts` lists
  `GLOBAL_PERMISSIONS` and maps each to CASL `[action, subject]` pairs
  (`'bounces.block': [['block', 'Bounce']]`). Migration `010-create-permissions.ts` creates
  `roles`, `role_permissions`, `user_permissions` and `project_members` and seeds the built-in
  roles' permissions; `016` adds scopes. The bounce controller requires only `read` and
  `unblock`; nothing in the backend or frontend checks `block`. The frontend lists the permission
  in `apps/frontend/src/modules/roles/permissionCatalog.ts` (`bounces: ['bounces.read',
'bounces.block', 'bounces.unblock']`), labels it in `en.json` (`bounces_block`: "Block
  addresses") and uses it in `roles/__tests__/roleFixtures.ts`. Latest migration: `020-create-locks.ts`.
- Sending: `MailService.sendMail` (`apps/backend/src/modules/mail/services/mail.service.ts`)
  records a pending mail message, then `deliver` loads the From domain through
  `DomainService.getSendingDomainByFqdn` (requires an active DKIM key), signs and sends. The send
  API's `PublicSendService.assertFromDomainUsable` checks project assignment
  (`FROM_DOMAIN_NOT_ALLOWED`) and the active DKIM key (`FROM_DOMAIN_NOT_READY`, message "The from
  domain has no active DKIM key"). `InboundFormDeliveryService.deliver` treats any error that is
  not a `MailSendError` as temporary: it records the attempt, keeps the row `pending` unless
  `isLastAttempt`, and rethrows so BullMQ retries (8 attempts, exponential backoff from 60 s).
  The UI already says "Unverified domains can be assigned, but forms can't send from them until
  their DNS records are valid" (`en.json` 302) and "{fqdn} can't send yet" (1079).
- DNS records: `DomainDnsService` generates per customer domain SPF `v=spf1 include:<MAIL_HOSTNAME>
~all`, DKIM `s1._domainkey.<fqdn>` and DMARC `_dmarc.<fqdn>` = `v=DMARC1; p=none;`; per
  platform domain A, AAAA (optional), MX, SPF `v=spf1 ip4:… [ip6:…] -all`, PTR(s), DKIM, DMARC.
  `reloadDnsRecords` resolves each record (TXT chunks joined) and sets `status = VALID` only when
  one resolved value equals `record.value` exactly, `current = matched ?? first ?? null`. The
  DNS health job runs every 15 minutes; the UI has **Check again**. `regenerateCustomerSpfRecords`
  rewrites every customer SPF value when `MAIL_HOSTNAME` changes. The UI (`apps/frontend/src/components/dns/DnsRecord.vue`)
  shows `value`, `current`, status and a per-use advice text (`en.json` `…advice.spf`: "Add the
  include from the value above to your existing SPF record instead of creating a second one").
  `apps/frontend/src/modules/domains/helpers/domainStatus.ts` calls a domain valid when every
  record is `valid`.
- Patterns: `apps/backend/src/modules/inbound-form/helpers/field-schema.ts` `compilePattern`
  returns `new RegExp(pattern)` after `findPatternProblem(pattern)` (ReDoS guard,
  `pattern-safety.ts`) passes; the UI hint (`en.json` 869) says "Optional. The whole value must
  match."; `FieldDialog.vue` also constructs a `RegExp` (to be checked for what it validates).
- `MAIL_HOSTNAME` switch: `SettingsService.onApplicationBootstrap` → `reconcileSendingDomain`
  (lines ~83–163): returns when the stored sending domain's fqdn equals `MAIL_HOSTNAME`; throws
  (startup aborts) when `MAIL_HOSTNAME` is registered as a customer domain by exact fqdn;
  otherwise deletes the old sending domain, then `createSendingDomain(fqdn, ips)`, which inserts
  with a unique `rootDomain` and therefore fails with `ConflictException` when a customer domain
  shares the registrable domain, leaving `settings.sendingDomainId` NULL (FK `SET NULL`) and the
  installation in the setup wizard. The lock's transaction is not joined by these calls.
- Logging: `bounce-mailbox.service.ts` (two sites) and `settings.service.ts` `reloadRecords`
  log `error.message`; `CLAUDE.md` requires `describeError(error)` (`src/helpers/describe-error.ts`)
  wherever the message can carry an address.
- DKIM: `domains.activeDkimId` points at one of possibly several `DomainDkim` rows; no service or
  endpoint switches it.
- Environments that send without valid DNS: local dev (`.env.example`, MailHog), the backend e2e
  stack (`apps/backend/test/support/infrastructure.ts`), the Playwright/docs stack
  (`packages/e2e-stack/src/infrastructure.ts`) and the smoke-test stack (`e2e/smoke/support/stack.ts`
  writes the `.env` of a production compose stack with `mail.smoke.test`).
- Docs pages that describe the affected behaviour: `apps/docs/configuration/environment.md`
  (drift-checked against `env.schema.ts`), `admin-guide/domains.md`, `admin-guide/bounces.md`,
  `admin-guide/users-and-roles.md`, `admin-guide/inbound-forms/fields.md`,
  `admin-guide/inbound-forms/deliveries.md`, `admin-guide/send-api.md`, `admin-guide/settings.md`,
  `api/overview.md`, `api/errors.md`, `installation/going-live.md`, `operations/troubleshooting.md`,
  `reference/roadmap.md`, `reference/glossary.md`.

## Decisions

1. **`bounces.block` is removed everywhere.** Backend: drop it from `GLOBAL_PERMISSIONS` and the
   CASL map, and drop the `'block'` ability action if nothing else uses it; a new migration
   `021-remove-bounces-block-permission.ts` deletes the rows naming `bounces.block` from
   `role_permissions` and `user_permissions` (`down` re-inserts it for the built-in roles that
   migration 010 seeded it for). Frontend: remove it from `permissionCatalog.ts`, `en.json`
   and `roleFixtures.ts`. Existing unit and e2e tests that enumerate permissions are updated.
   Docs: the permission disappears from `users-and-roles.md`, the note from `bounces.md`, the
   known limit from `roadmap.md`.
2. **Sending requires valid DNS records of the From domain.** A new setting
   `SEND_REQUIRE_VALID_DNS` (`z.stringbool().default(true)` in `env.schema.ts`) controls it:
   `true` in production (`deploy/.env.example` lists it as `true`), `false` in `.env.example`
   and in the three test stacks (backend e2e, `e2e-stack`, smoke). A domain is **ready to send**
   when `getSendingDomainByFqdn` finds it (active DKIM key, as today) and every one of its DNS
   records has `status = VALID` (`DomainService.isReadyToSend(domain)`; a domain with no records is
   not ready). Only the From domain is checked, not the platform sending domain, because a missing
   IPv6 PTR or a half-migrated platform record must not stop all customer mail; the platform
   domain's own health stays visible under **Settings**. The check reads the stored statuses, so a
   fix in DNS takes effect at the next 15-minute check or after **Check again**; the docs say so.
   Because statuses stored by the old exact-match logic may be stale at upgrade time, the DNS
   health check runs once right after startup (same single-instance lock as the interval job)
   instead of first after 15 minutes; a resolver hiccup is already tolerated today (only a
   definitive "no record" answer flips a status, every other lookup error leaves it unchanged),
   so no extra debounce is added. Readiness is strict by owner decision (2026-11-02): a `MAIL_HOSTNAME` switch rewrites every customer SPF value and marks it invalid, so customer sending stops until each customer publishes the new include and a check has run; `settings.md`, `troubleshooting.md` and `going-live.md` warn about this prominently, and the `MAIL_HOSTNAME` procedure on `settings.md` tells the operator to announce the change to customers before the switch.
    - `MailService.sendMail` calls `DomainService.assertReadyToSend(fqdn)` before
      `recordPending` when the setting is on and throws `DomainNotReadyError` (a plain `Error`
      subclass in the domain module with `name = 'DomainNotReadyError'`; its message names the
      domain id and fqdn, never an address), so no Sent-mail row is created for a refused send.
    - Send API: `assertFromDomainUsable` calls the same check and maps `DomainNotReadyError` to
      `422 FROM_DOMAIN_NOT_READY` with the message "The from domain has DNS records that are not
      valid yet"; the existing DKIM message stays for the DKIM case.
    - Inbound forms: `InboundFormDeliveryService.deliver` needs no new branch: the error is not a
      `MailSendError`, so the attempt is recorded, the row stays `pending` until `isLastAttempt`,
      the error is rethrown and BullMQ retries on the normal schedule; the last attempt records
      `failed` with the error message. The recovery sweep behaves as today.
    - The UI texts quoted above become true and stay.
3. **SPF and DMARC are checked by content.** A pure helper `evaluateTxtRecord(record, resolvedValues)`
   (new `apps/backend/src/modules/domain/helpers/txt-record-check.ts`, unit-tested) decides the
   status and `current` for TXT records by `use`:
    - **SPF:** the SPF records among the resolved values are those matching `/^v=spf1(\s|$)/i`.
      Exactly one must exist; several or none → `INVALID`. The one record is split on whitespace
      into terms; the record is `VALID` when it contains every mechanism of the generated value
      except the `all` term (`include:<MAIL_HOSTNAME>` for customer domains; every `ip4:`/`ip6:`
      mechanism for the platform domain), compared case-insensitively; the `all` qualifier and
      any extra mechanisms are ignored. `current` = the single SPF record, or the first SPF record
      when there are several, or the first TXT value, or `null`.
    - **DMARC** (kept unless the owner objects; included because the going-live page tells operators to move
      `p=none` → `p=quarantine` → `p=reject` and the exact match turns that into Invalid): exactly
      one record matching `/^v=DMARC1(\s*;|$)/i` must exist and contain a `p=` tag with `none`,
      `quarantine` or `reject`; several or none → `INVALID`; `current` as for SPF.
    - **DKIM and every non-TXT record:** exact match as today.
    - The record gains a stored `issue` (nullable enum `missing | mismatch | incomplete |
multiple`, new column on the DNS record table via migration, exposed on the record DTO and
      therefore in the generated client): `missing` when no value of the record's kind resolved,
      `multiple` when several SPF or DMARC records exist, `incomplete` when the single SPF/DMARC
      record lacks a required mechanism or tag, `mismatch` for an exact-match record whose
      value differs, `null` when valid. The frontend reads `issue` to choose the reason text and
      shows the merge suggestion only for `incomplete`.
    - **Admin UI:** a pure helper `suggestSpfMerge(expected, current)` (new
      `apps/frontend/src/modules/domains/helpers/spfMerge.ts`, unit-tested) returns the merged
      value: `current`'s terms with the missing mechanisms of `expected` inserted before its `all`
      term (appended before a final `~all` if `current` has no `all` term), or `null` when nothing
      is missing. `DnsRecord.vue` shows, for an SPF record whose `current` starts with `v=spf1`
      and whose status is invalid, a block "Your name already has an SPF record" with the current
      value, the suggested merged value and a copy button, instead of the generic advice; when
      several SPF records exist it shows the reason "Several SPF records were found; a name may
      have only one" and the advice to merge them into one. New `en.json` keys live next to the
      existing `advice`/`reason` keys of the records card; no SFC `<i18n>` blocks.
    - Docs: `domains.md` explains the content check and the merge suggestion; `going-live.md`
      drops the warning that a DMARC policy change shows as Invalid; `troubleshooting.md`'s "DNS
      records stay Invalid" entry gains "several SPF records".
4. **Patterns are anchored.** `compilePattern` returns `new RegExp(`^(?:${pattern})$`)` after
   the unchanged `findPatternProblem(pattern)` check; patterns that already carry `^`/`$` keep
   working (`^(?:^abc$)$` accepts exactly what `^abc$` accepts). The frontend's `RegExp` use in
   `FieldDialog.vue` is aligned the same way if it validates values, left alone if it only
   validates syntax. Docs: `fields.md` states whole-value matching and drops the advice to add
   anchors; `roadmap.md` drops the limit.
5. **`MAIL_HOSTNAME` switch refuses to start on a root-domain conflict.** In
   `reconcileSendingDomain`, after the exact-fqdn check and before any deletion: compute the
   registrable domain of `MAIL_HOSTNAME` (`parse(...).domain`, as `DomainService` does) and look
   for a domain with that `rootDomain` other than the current sending domain; if one exists,
   throw an `Error` whose message names both (`MAIL_HOSTNAME mx.example.net shares the registrable
domain example.net with the customer domain mail.example.net. Rename MAIL_HOSTNAME or delete
that domain before switching.`), which aborts startup like the existing check. No deletion
   happens, the old sending domain keeps working after a revert. The health endpoints are not
   involved: a refused start is visible in `docker compose ps` and the log, which is the
   behaviour the owner chose over a degraded-but-running state. Docs: `settings.md` replaces the
   danger box's failure description with the refusal and its message; `troubleshooting.md`'s
   `MAIL_HOSTNAME` entry follows; `roadmap.md` drops the limit.
6. **`describeError` in the three log sites** (`bounce-mailbox.service.ts` poll and
   per-message handlers, `settings.service.ts` `reloadRecords`); specs that assert those messages
   are updated.
7. **DKIM rotation stays unimplemented**; `TODO.md` gains an entry under a new "Domains" heading
   describing what exists (`activeDkimId`, several keys per domain) and what is missing (a
   service action that generates a new key, publishes its record, switches `activeDkimId` once
   the record validates, and retires the old key), and the `roadmap.md` entry "no DKIM key
   regeneration after a lost encryption secret" points at it.
8. **Tests follow the repo rules** (CLAUDE.md "Keep tests in step with logic"): unit specs for
   the new helpers (`txt-record-check`, `spfMerge`, anchored patterns, `isReadyToSend`), updated
   specs for the changed services, and e2e coverage for the send gate (`422` for an unverified
   domain with the setting on; a delivery that stays `pending` across attempts while the domain is
   unverified and is sent once its records are marked valid) and for the startup refusal. How an
   e2e spec turns `SEND_REQUIRE_VALID_DNS` on while the e2e stack default is off is left to the
   builder (the e2e app is built per spec file from `process.env`; a `ConfigService` override or a
   per-file env is acceptable), bearing in mind the memory note that a second e2e app rebinds
   models.
9. **Docs in the same change**, page by page as listed above, plus `environment.md` (the drift
   check fails the docs build until the new variable is documented), `api/errors.md` and
   `send-api.md` (`FROM_DOMAIN_NOT_READY` now also means invalid DNS), `deliveries.md` (the
   wait-then-fail path and the error text an operator sees), `glossary.md` ("ready to send").
   The README and `CLAUDE.md` need no change beyond `CLAUDE.md`'s env list if it enumerates
   variables (it names groups; add `SEND_REQUIRE_VALID_DNS` where `SMTP_REQUIRE_TLS` is named).

## Non-goals

- DKIM key rotation (todo only).
- Any change to how DNS is resolved, to the 15-minute interval, or to the platform sending
  domain's readiness.
- A manual "block address" feature replacing the removed permission.
- Changing the retry schedule of inbound-form deliveries.

## Anti-goals

- A refused send that leaves a Sent-mail row behind.
- A delivery from an unverified domain failing immediately (the owner chose wait-then-fail).
- Breaking local development or any test stack by enforcing DNS validity there.
- An SPF check that accepts two SPF records or rejects a correctly merged one.

## Left to the builder

- Exact names of the new `en.json` keys and the layout of the merge block in `DnsRecord.vue`.
- Whether the `'block'` ability action type stays in `AbilityAction` (remove it if unused).
- The mechanism to run an e2e spec with `SEND_REQUIRE_VALID_DNS=true`.
- The migration's `down` body details.
