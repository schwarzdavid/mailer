# Domain, Sending and Permission Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead `bounces.block` permission, gate sending on valid DNS records of the From domain (strict, with a wait-then-fail path for form deliveries), check SPF and DMARC records by content with a merge suggestion in the UI, anchor field patterns, refuse a `MAIL_HOSTNAME` switch that would collide with a customer's registrable domain, log `describeError` in three places, record DKIM rotation as a todo, and update the documentation site for every change.

**Architecture:** Backend changes live in the existing feature modules (`permission`, `domain`, `mail`, `api-key`, `inbound-form`, `settings`, `bounce`) with two new migrations (021 data, 022 schema). DNS records gain a stored `issue` so the UI can explain _why_ a record is invalid; a pure helper evaluates SPF/DMARC by content. The send gate is one method on `MailService` (`assertFromDomainReady`), switched by a new env setting, used before any Sent-mail row is written and mapped to `422 FROM_DOMAIN_NOT_READY` by the send API; form deliveries need no new branch because a non-`MailSendError` is already retried. The DNS health check additionally runs once after startup when the gate is on. The frontend gets a pure SPF-merge helper and a `DnsRecord.vue` that renders by `issue`. Every task updates the affected docs pages.

**Tech Stack:** NestJS 12 (ESM, Sequelize, umzug migrations, Zod env), Vitest, Vue 3 + Vuetify + vue-i18n, VitePress docs, pnpm/Turbo.

**Spec:** `docs/superpowers/specs/2026-11-02-domain-sending-and-permission-fixes-design.md` (approved 2026-11-02: strict readiness, DMARC content check kept).

## Global Constraints

- **Never touch git** (CLAUDE.md). Every "commit" step is: leave the changes in the working tree and report the files touched.
- **No code comments**; config files comment-free. Backend sources are native ESM: relative imports carry `.js` even in TypeScript. Prettier owns formatting (`pnpm format:fix`): 4 spaces, single quotes, no semicolons, trailing commas.
- **Tests in step with logic** (CLAUDE.md): every behaviour change has a unit spec; the send gate and the `MAIL_HOSTNAME` refusal also get e2e coverage. Type every `vi.fn` with its signature; no loose literals or `as` casts for domain objects.
- **Logs** name records by id and use `describeError(error)` (`apps/backend/src/helpers/describe-error.ts`) wherever a message could carry an address.
- **API contract**: after any DTO change run `pnpm build --filter api` so the generated client (`api`) matches; the frontend imports `DomainDnsRecordDto` from `api`.
- **Docs in the same task** (CLAUDE.md "Keep the operator docs in step"): pages under `apps/docs/` follow their existing conventions (placeholders `app.example.com`, `mx.example.com`, `mail.example.net`, `example.org`; bold UI labels from `apps/frontend/src/locales/en.json`; `<code v-pre>` for `{{…}}` in inline code; `## How you know it worked` on procedural pages); `pnpm build --filter docs` must pass (env drift check, dead links).
- **Exact values**: new env `SEND_REQUIRE_VALID_DNS` (`z.stringbool().default(true)`), `false` in `.env.example`, `packages/e2e-stack/src/infrastructure.ts`, `apps/backend/test/support/infrastructure.ts` and the smoke stack `.env` (`e2e/smoke/support/stack.ts`), listed as `true` in `deploy/.env.example`. Readiness: the From domain has an active DKIM key and at least one DNS record and every record `status = valid`; only the From domain is checked. Send-API message for the DNS case: `The from domain has DNS records that are not valid yet`. `DomainNotReadyError` message: `Domain <domainId> (<fqdn>) has DNS records that are not valid yet`. SPF regex `/^v=spf1(\s|$)/i`; DMARC regex `/^v=DMARC1(\s*;|$)/i` and a `p=` tag with `none|quarantine|reject`. Issue values `missing | mismatch | incomplete | multiple`. Migrations `021-remove-bounces-block-permission.ts`, `022-add-domain-dns-issue.ts`. Pattern wrapper `^(?:${pattern})$`. Startup refusal message: `MAIL_HOSTNAME <host> shares the registrable domain <root> with the customer domain <fqdn>. Rename MAIL_HOSTNAME or delete that domain before switching.`
- **Per-task gate**: `pnpm --filter backend lint`, `typecheck`, `test` (and `pnpm --filter frontend lint`, `typecheck`, `test` when the frontend changed), `pnpm format:fix`; tasks that change DTOs run `pnpm build --filter api` and `pnpm --filter frontend typecheck`; tasks that change docs run `pnpm build --filter docs`; tasks marked e2e run `pnpm --filter backend test:e2e` (Docker).

## Review Focus

1. **Upgrade with stale statuses.** An installation whose records were marked Invalid by the old exact match (merged SPF, DMARC `p=quarantine`) must not refuse to send for 15 minutes after the upgrade. _Pinned in Task 6: `DnsHealthService` runs the check once on bootstrap when the gate is on (spec asserts it is called, and not called when the gate is off)._
2. **A refused send leaves no Sent-mail row and a form delivery keeps retrying.** _Pinned in Task 6: `MailService` spec asserts `recordPending` is not called when the domain is not ready; the delivery spec asserts `DomainNotReadyError` keeps the row pending and is rethrown, and marks it failed on the last attempt._
3. **SPF variants.** Uppercase mechanisms, extra mechanisms, `-all`/`~all`/`?all`, a missing `all` term, two SPF records, a TXT record that is not SPF. _Pinned in Task 4: `txt-record-check.spec.ts`._
4. **Patterns with their own anchors.** `^abc$`, `a|b`, patterns rejected by the safety check. _Pinned in Task 3._
5. **The root-domain conflict deletes nothing.** _Pinned in Task 8: the e2e spec asserts the old sending domain row still exists after the refusal._

Not covered by tests: the rendered look of the merge block (checked by hand in Task 5), the docs prose (reviewed, not tested beyond the build).

---

### Task 1: Remove the `bounces.block` permission

**Files:**

- Modify: `apps/backend/src/modules/permission/permission.constants.ts` (drop from `GLOBAL_PERMISSIONS` and the CASL map), `apps/backend/src/modules/permission/interfaces/app-ability.ts` (drop `'block'` from `AbilityAction` if nothing else uses it)
- Create: `apps/backend/src/migrations/021-remove-bounces-block-permission.ts`
- Modify: every backend spec or e2e spec that enumerates permissions (`grep -rn "bounces.block\|'block'" apps/backend/src apps/backend/test`)
- Modify: `apps/frontend/src/modules/roles/permissionCatalog.ts`, `apps/frontend/src/locales/en.json` (key `bounces_block`), `apps/frontend/src/modules/roles/__tests__/roleFixtures.ts` and any frontend spec that counts bounce permissions
- Modify docs: `apps/docs/admin-guide/users-and-roles.md` (permission table), `apps/docs/admin-guide/bounces.md` (remove the "has no effect" note), `apps/docs/reference/roadmap.md` (remove "The permission Block addresses does nothing")

**Interfaces:**

- Produces: `GLOBAL_PERMISSIONS` has 18 entries; `AbilityAction` without `'block'`.

- [ ] **Step 1: Write the failing test**

In `apps/backend/src/modules/permission/permission.constants.spec.ts` (create if missing):

```ts
it('does not define a block permission for bounces', () => {
    expect(GLOBAL_PERMISSIONS).not.toContain('bounces.block')
    expect(GLOBAL_PERMISSIONS.filter((permission) => permission.startsWith('bounces.'))).toEqual([
        'bounces.read',
        'bounces.unblock',
    ])
})
```

- [ ] **Step 2: Run it** — `pnpm --filter backend exec vitest run src/modules/permission/permission.constants.spec.ts` — Expected: FAIL (contains `bounces.block`).

- [ ] **Step 3: Remove the permission** in the constants and the ability type; write migration 021: `up` runs `DELETE FROM "role_permissions" WHERE "permission" = 'bounces.block'` and `DELETE FROM "user_permissions" WHERE "permission" = 'bounces.block'`; `down` runs `INSERT INTO "role_permissions" ("roleId", "permission", "createdAt", "updatedAt") SELECT "roleId", 'bounces.block', NOW(), NOW() FROM "roles" WHERE "type" = 'admin'` (the only role migration 010 seeded it for). Model the file on `019-add-delivery-attempts.ts`.

- [ ] **Step 4: Fix every spec and e2e spec that listed the permission**, then the frontend (catalog, `en.json`, fixtures, specs).

- [ ] **Step 5: Run** — `pnpm --filter backend test`, `pnpm --filter frontend test` — Expected: PASS. Then `pnpm --filter backend test:e2e` (permission/role/migration suites). Expected: PASS, including `migrations.e2e-spec.ts` picking up 021.

- [ ] **Step 6: Docs** — remove the permission from the tables and the two notes; `pnpm build --filter docs`.

- [ ] **Step 7: Gate and commit** — per-task gate; report files.

---

### Task 2: `describeError` in the three log sites and the DKIM todo

**Files:**

- Modify: `apps/backend/src/modules/bounce/services/bounce-mailbox.service.ts` (two `error.message` sites), `apps/backend/src/modules/settings/services/settings.service.ts` (`reloadRecords`), their specs if they assert the message
- Modify: `TODO.md` (new `## Domains` section)

- [ ] **Step 1: Write the failing tests** — in `bounce-mailbox.service.spec.ts`: a poll that rejects with `Object.assign(new Error('mailbox user@example.org missing'), { code: 'ENOENT' })` logs a message that contains `Error (code ENOENT)` and does not contain `@`; same shape for the per-message handler and for `settings.service.spec.ts` `reloadRecords`.
- [ ] **Step 2: Run them** — Expected: FAIL (message contains the address).
- [ ] **Step 3: Replace** the three `error instanceof Error ? error.message : String(error)` constructions with `describeError(error)` (import from `../../../helpers/describe-error.js`); delete now-unused local helpers.
- [ ] **Step 4: Run** — `pnpm --filter backend exec vitest run src/modules/bounce src/modules/settings` — Expected: PASS.
- [ ] **Step 5: `TODO.md`** — add:

```markdown
## Domains

- [ ] **DKIM key rotation.** `domains.activeDkimId` already points at one of possibly several `domain_dkim` rows, but no service or endpoint creates a second key or switches the active one. Add an action that generates a new key and its `s2._domainkey` record, switches `activeDkimId` once the record validates, and retires the old key after a grace period; it is also the only recovery from a lost `BACKEND_ENCRYPTION_SECRET` short of deleting and re-adding every domain.
```

- [ ] **Step 6: Gate and commit.**

---

### Task 3: Anchor inbound-form field patterns

**Files:**

- Modify: `apps/backend/src/modules/inbound-form/helpers/field-schema.ts` (`compilePattern`), `field-schema.spec.ts`
- Modify docs: `apps/docs/admin-guide/inbound-forms/fields.md` (validation rules: whole-value matching, drop the "add `^` and `$` yourself" advice), `apps/docs/reference/roadmap.md` (remove "Field patterns are not anchored")

- [ ] **Step 1: Write the failing tests** in `field-schema.spec.ts`:

```ts
it('matches a pattern against the whole value', () => {
    const schema = buildFieldSchema(textField({ pattern: '[0-9]+' }))
    expect(schema.safeParse('123').success).toBe(true)
    expect(schema.safeParse('abc123').success).toBe(false)
})
it('keeps working for patterns that carry their own anchors', () => {
    const schema = buildFieldSchema(textField({ pattern: '^abc$' }))
    expect(schema.safeParse('abc').success).toBe(true)
    expect(schema.safeParse('xabc').success).toBe(false)
})
it('anchors an alternation as a whole', () => {
    const schema = buildFieldSchema(textField({ pattern: 'a|b' }))
    expect(schema.safeParse('ab').success).toBe(false)
})
```

Use the spec file's existing field fixture helper and the exported schema builder (names as in the file; `textField`/`buildFieldSchema` stand for them).

- [ ] **Step 2: Run** — Expected: FAIL (`abc123` passes today).
- [ ] **Step 3: Implement** `compilePattern(pattern)`: `findPatternProblem(pattern) === null ? new RegExp(`^(?:${pattern})$`) : null`. `FieldDialog.vue` only validates syntax; leave it.
- [ ] **Step 4: Run** — PASS. Then the whole inbound-form unit folder.
- [ ] **Step 5: Docs** — `fields.md` says the pattern must match the whole value (example `[0-9]{5}` accepts `12345`, rejects `A12345`); roadmap entry removed; `pnpm build --filter docs`.
- [ ] **Step 6: Gate and commit.**

---

### Task 4: DNS record `issue` and content checks for SPF and DMARC (backend)

**Files:**

- Modify: `apps/backend/src/modules/domain/interfaces/domain-dns.interface.ts` (enum `DomainDnsRecordIssue`, field `issue`), `apps/backend/src/modules/domain/models/domain-dns.model.ts` (column), `apps/backend/src/modules/domain/dtos/domain-dns-record.dto.ts` (`@Expose() issue`, `@ApiProperty({ enum: DomainDnsRecordIssue, nullable: true })`)
- Create: `apps/backend/src/migrations/022-add-domain-dns-issue.ts`
- Create: `apps/backend/src/modules/domain/helpers/txt-record-check.ts`, `txt-record-check.spec.ts`
- Modify: `apps/backend/src/modules/domain/services/domain-dns.service.ts` (`createRecord` callers set `issue: DomainDnsRecordIssue.MISSING`; `reloadDnsRecords` uses the helpers), `domain-dns.service.spec.ts`
- Modify: `apps/backend/test/domain.e2e-spec.ts` / `settings.e2e-spec.ts` expectations that compare record objects (add `issue`)
- Run: `pnpm build --filter api`

**Interfaces:**

- Produces (`domain-dns.interface.ts`): `export enum DomainDnsRecordIssue { MISSING = 'missing', MISMATCH = 'mismatch', INCOMPLETE = 'incomplete', MULTIPLE = 'multiple' }`; `DomainDnsRecord.issue: DomainDnsRecordIssue | null`.
- Produces (`txt-record-check.ts`):

```ts
export interface RecordEvaluation {
    status: DomainDnsRecordStatus
    current: string | null
    issue: DomainDnsRecordIssue | null
}
export function evaluateExactRecord(expected: string, resolved: string[]): RecordEvaluation
export function evaluateSpfRecord(expected: string, resolved: string[]): RecordEvaluation
export function evaluateDmarcRecord(expected: string, resolved: string[]): RecordEvaluation
export function evaluateRecord(use: DomainDnsRecordUse, expected: string, resolved: string[]): RecordEvaluation
```

`evaluateRecord` dispatches SPF → `evaluateSpfRecord`, DMARC → `evaluateDmarcRecord`, everything else → `evaluateExactRecord`. Exact: match → `valid/matched/null`; no values → `invalid/null/missing`; otherwise `invalid/resolved[0]/mismatch`. SPF: `spf = resolved.filter(v => /^v=spf1(\s|$)/i.test(v))`; none → `invalid/(resolved[0] ?? null)/missing`; several → `invalid/spf[0]/multiple`; one → required mechanisms = lower-cased whitespace terms of `expected` minus the first term (`v=spf1`) and any term matching `/^[-~+?]?all$/i`; valid when every required term is among the record's lower-cased terms, else `invalid/spf[0]/incomplete`. DMARC: `dmarc = resolved.filter(v => /^v=DMARC1(\s*;|$)/i.test(v))`; none/several as SPF; one → valid when `/(^|;)\s*p\s*=\s*(none|quarantine|reject)\s*(;|$)/i` matches, else `incomplete`.

- [ ] **Step 1: Write the failing helper tests** (`txt-record-check.spec.ts`), at least:

```ts
describe('evaluateSpfRecord', () => {
    const expected = 'v=spf1 include:mx.example.com ~all'
    it('accepts a merged record with extra mechanisms and a different qualifier', () => {
        expect(evaluateSpfRecord(expected, ['v=spf1 ip4:192.0.2.1 INCLUDE:mx.example.com -all'])).toEqual({
            status: 'valid', current: 'v=spf1 ip4:192.0.2.1 INCLUDE:mx.example.com -all', issue: null,
        })
    })
    it('accepts a record without an all term', () => { … 'v=spf1 include:mx.example.com' → valid })
    it('reports a record that lacks the include as incomplete', () => { … 'v=spf1 ip4:192.0.2.1 ~all' → invalid/incomplete })
    it('reports several SPF records as multiple', () => { … two spf values → invalid, current = first, issue 'multiple' })
    it('ignores non-SPF TXT values and reports missing', () => { … ['google-site-verification=x'] → invalid/'google-site-verification=x'/missing })
    it('requires every ip mechanism of a platform record', () => { expected 'v=spf1 ip4:203.0.113.10 ip6:2001:db8::10 -all'; a record with only ip4 → incomplete })
})
describe('evaluateDmarcRecord', () => { none → missing; 'v=DMARC1; p=quarantine; rua=mailto:a@example.org' → valid; 'v=DMARC1; sp=none' → incomplete; two → multiple })
describe('evaluateExactRecord', () => { match → valid; different → mismatch; none → missing })
```

(Write the elided cases out in full.)

- [ ] **Step 2: Run** — `pnpm --filter backend exec vitest run src/modules/domain/helpers/txt-record-check.spec.ts` — FAIL (module missing).
- [ ] **Step 3: Implement the helper and the interface/enum.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Write the failing service tests** in `domain-dns.service.spec.ts` `reloadDnsRecords`: a customer SPF record resolved as `['v=spf1 ip4:192.0.2.1 include:<sending> -all']` is saved `valid` with `issue: null`; two SPF values → `invalid`, `issue: 'multiple'`; the DKIM mismatch case now saves `issue: 'mismatch'`; a created record starts with `issue: 'missing'`.
- [ ] **Step 6: Run** — FAIL. **Step 7: Implement**: migration 022 (`ALTER TABLE "domain_dns" ADD COLUMN "issue" VARCHAR(32)`; backfill `UPDATE "domain_dns" SET "issue" = CASE WHEN "status" = 'valid' THEN NULL WHEN "current" IS NULL THEN 'missing' ELSE 'mismatch' END`; `down` drops the column), model column `@Column(DataType.STRING(32)) declare issue: DomainDnsRecordIssue | null`, DTO field, `createRecord` callers pass `issue: DomainDnsRecordIssue.MISSING`, `reloadDnsRecords` replaces the exact comparison with `const evaluation = evaluateRecord(record.use, record.value, currentValues)` and assigns `status`, `current`, `issue`. `regenerateCustomerSpfRecords` also sets `issue: DomainDnsRecordIssue.MISSING`.
- [ ] **Step 8: Run** — unit PASS; `pnpm build --filter api`; `pnpm --filter frontend typecheck` (the DTO gained a field; nothing breaks); `pnpm --filter backend test:e2e` (domain/settings/migrations suites) — fix expectations that compare whole record objects.
- [ ] **Step 9: Gate and commit.**

---

### Task 5: SPF merge suggestion and issue-based reasons in the UI, with the docs

**Files:**

- Create: `apps/frontend/src/modules/domains/helpers/spfMerge.ts`, `apps/frontend/src/modules/domains/helpers/__tests__/spfMerge.spec.ts`
- Modify: `apps/frontend/src/components/dns/DnsRecord.vue`, `apps/frontend/src/components/__tests__/DnsRecord.spec.ts`, `apps/frontend/src/locales/en.json` (`dns.reason.*`, `dns.advice.*`)
- Modify docs: `apps/docs/admin-guide/domains.md` (sections "Publish the three records" and "Check the records": content check, one SPF record per name, the merge suggestion), `apps/docs/installation/going-live.md` (drop the warning that a DMARC policy change shows as Invalid; say the check accepts any policy), `apps/docs/operations/troubleshooting.md` ("DNS records stay Invalid": add "several SPF records" and "the SPF record lacks the include"), `apps/docs/reference/roadmap.md` (remove "DNS checks compare exact values"), `apps/docs/admin-guide/settings.md` if it repeats the exact-match rule

**Interfaces:**

- Produces (`spfMerge.ts`): `export function suggestSpfMerge(expected: string, current: string): string | null` — terms of `current` split on whitespace; required = terms of `expected` minus `v=spf1` and the `all` term; missing = required terms not present (case-insensitive); `null` when none missing; otherwise insert the missing terms before `current`'s `all` term, or append them followed by `~all` when `current` has no `all` term; join with single spaces.
- Consumes: `DomainDnsRecordDto.issue` from `api` (Task 4).

- [ ] **Step 1: Write the failing helper tests**:

```ts
it('inserts the missing include before the all term', () => {
    expect(suggestSpfMerge('v=spf1 include:mx.example.com ~all', 'v=spf1 ip4:192.0.2.1 -all')).toBe(
        'v=spf1 ip4:192.0.2.1 include:mx.example.com -all',
    )
})
it('appends the include and a soft-fail all term when the record has none', () => {
    expect(suggestSpfMerge('v=spf1 include:mx.example.com ~all', 'v=spf1 ip4:192.0.2.1')).toBe(
        'v=spf1 ip4:192.0.2.1 include:mx.example.com ~all',
    )
})
it('returns null when nothing is missing', () => {
    expect(suggestSpfMerge('v=spf1 include:mx.example.com ~all', 'v=spf1 INCLUDE:mx.example.com -all')).toBeNull()
})
```

- [ ] **Step 2: Run** — `pnpm --filter frontend exec vitest run src/modules/domains/helpers/__tests__/spfMerge.spec.ts` — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Write the failing component tests** in `DnsRecord.spec.ts` (mount with the existing helpers): an SPF record with `issue: 'incomplete'` and `current: 'v=spf1 ip4:192.0.2.1 -all'` renders the text of `dns.advice.spfMerge` and a copy field containing `include:`; an SPF record with `issue: 'multiple'` renders `dns.reason.multiple`; a DKIM record with `issue: 'mismatch'` renders `dns.advice.replace` (as today); `issue: 'missing'` renders `dns.reason.missing`.
- [ ] **Step 6: Run** — FAIL. **Step 7: Implement** in `DnsRecord.vue`: branch on `record.issue`: `multiple` → reason paragraph `t('dns.reason.multiple', { name })`; `incomplete` + `use === 'spf'` → DisclosureBox with the current value, the advice `t('dns.advice.spfMerge')` and a `CopyField` with `suggestSpfMerge(record.value, record.current)`; `incomplete` + `use === 'dmarc'` → current value plus `t('dns.advice.dmarc')`; `mismatch` → today's "Found a different value" block with `dns.advice.replace` (PTR keeps its own advice); `missing` → today's reason. `en.json` additions under `dns`: `reason.multiple`: "Several {name} records were found. A name may have only one; merge them into one record.", `advice.spfMerge`: "Your name already has an SPF record. Keep it and add the mailer include; this is the merged value:", `advice.dmarc`: "Keep your DMARC record and make sure it has a policy tag: p=none, p=quarantine or p=reject." Remove the now-unused `advice.spf` key if nothing else uses it.
- [ ] **Step 8: Run** — frontend unit PASS; `pnpm --filter frontend lint`, `typecheck`. Check the look once: `pnpm dev --filter frontend` is not required; a mount test suffices, but open the domain detail page in the running app if a dev stack is at hand and note the result in the report.
- [ ] **Step 9: Docs** — the four pages; `pnpm build --filter docs`.
- [ ] **Step 10: Gate and commit.**

---

### Task 6: The send gate (`SEND_REQUIRE_VALID_DNS`) — backend

**Files:**

- Modify: `apps/backend/src/config/env.schema.ts` (`SEND_REQUIRE_VALID_DNS: z.stringbool().default(true)` after `SMTP_REQUIRE_TLS`), `apps/backend/src/config/env-keys.spec.ts` (`toHaveLength(41)`), `.env.example`, `deploy/.env.example`, `packages/e2e-stack/src/infrastructure.ts` (`BackendEnv` + value `'false'`), `apps/backend/test/support/infrastructure.ts` (`'false'`), `e2e/smoke/support/stack.ts` (`SEND_REQUIRE_VALID_DNS=false` in `envFileContent`)
- Create: `apps/backend/src/modules/domain/exceptions/domain-not-ready.error.ts`
- Modify: `apps/backend/src/modules/domain/services/domain-dns.service.ts` (`allRecordsValid`), `domain.service.ts` (`assertReadyToSend`), their specs
- Modify: `apps/backend/src/modules/mail/services/mail.service.ts` (`assertFromDomainReady`, called in `sendMail` before `recordPending`; inject `ConfigService<Env, true>`), `mail.service.spec.ts`
- Modify: `apps/backend/src/modules/api-key/services/public-send.service.ts` (`assertFromDomainUsable` maps `DomainNotReadyError`), `public-send.service.spec.ts`
- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form-delivery.service.spec.ts` (new cases; no service change)
- Modify: `apps/backend/src/modules/domain/services/dns-health.service.ts` (`onApplicationBootstrap` runs `handleCheckInterval` once when the gate is on; inject `ConfigService`), `dns-health.service.spec.ts`
- Modify e2e: `apps/backend/test/public-send.e2e-spec.ts`, `apps/backend/test/inbound-form.e2e-spec.ts` (or a new `send-gate.e2e-spec.ts`)
- Modify: `CLAUDE.md` (name `SEND_REQUIRE_VALID_DNS` next to `SMTP_REQUIRE_TLS` in the env paragraph)

**Interfaces:**

- Produces: `export class DomainNotReadyError extends Error { constructor(readonly domainId: number, readonly fqdn: string) }` with `name = 'DomainNotReadyError'`.
- Produces: `DomainDnsService.allRecordsValid(domainId: number): Promise<boolean>` (true iff ≥ 1 record and all `valid`); `DomainService.assertReadyToSend(domain: Pick<Domain, 'domainId' | 'fqdn'>): Promise<void>` (throws `DomainNotReadyError`).
- Produces: `MailService.assertFromDomainReady(fqdn: string): Promise<void>` — no-op when `SEND_REQUIRE_VALID_DNS` is false; otherwise looks the domain up with `domainService.getDomainByFqdn(fqdn)` and, if it exists, calls `assertReadyToSend` (a missing domain is left to `deliver`, which fails as today). `sendMail` calls it before `recordPending`.

- [ ] **Step 1: Write the failing tests**
    - `env.schema` / `env-keys.spec.ts`: expect 41 keys and `SEND_REQUIRE_VALID_DNS` present.
    - `domain-dns.service.spec.ts`: `allRecordsValid` true for two valid records, false for one invalid, false for none.
    - `domain.service.spec.ts`: `assertReadyToSend` resolves when `allRecordsValid` is true, rejects with `DomainNotReadyError` naming the id otherwise.
    - `mail.service.spec.ts`: with the setting on and a domain whose `assertReadyToSend` rejects, `sendMail` rejects with `DomainNotReadyError` and `recordPending` was not called; with the setting off the check is skipped; with the setting on and a ready domain the mail is sent.
    - `public-send.service.spec.ts`: a `DomainNotReadyError` from `assertFromDomainReady` becomes `PublicSendException` with code `FROM_DOMAIN_NOT_READY`, status 422 and the message `The from domain has DNS records that are not valid yet`.
    - `inbound-form-delivery.service.spec.ts`: `sendMail` rejecting with `DomainNotReadyError` keeps the row `pending`, stores the message in `error`, rethrows; on `isLastAttempt` marks it `failed` and still rethrows.
    - `dns-health.service.spec.ts`: `onApplicationBootstrap` calls `handleCheckInterval` when the setting is on and not when it is off.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** all of the above; the env files and stacks; `CLAUDE.md` mention. In `dns-health.service.ts` the bootstrap call is fire-and-forget (`void this.handleCheckInterval()`) so startup is not delayed.
- [ ] **Step 4: Run** — `pnpm --filter backend test` PASS; `pnpm --filter e2e-stack typecheck`; `pnpm --filter e2e lint typecheck`.
- [ ] **Step 5: e2e** — in `public-send.e2e-spec.ts` (or a new spec file that sets `process.env.SEND_REQUIRE_VALID_DNS = 'true'` before `createTestApp()` and restores it after, the way `settings.e2e-spec.ts` boots a second app for a changed `MAIL_HOSTNAME`): sending from an assigned domain whose records are `invalid` answers `422` with `code FROM_DOMAIN_NOT_READY` and the message above and creates no `mail_message` row; after `UPDATE`-ing the domain's records to `valid` through the model, the same request answers `202`. For deliveries: submit a form whose domain is invalid, run `InboundFormDeliveryService.deliver(id, false)` directly → row `pending`, `attempts` 1, `error` set; mark the records valid, run `deliver(id, false)` again → `sent`. Run `pnpm --filter backend test:e2e` — PASS.
- [ ] **Step 6: Gate and commit.**

---

### Task 7: Docs for the send gate

**Files:**

- Modify: `apps/docs/configuration/environment.md` (new row `SEND_REQUIRE_VALID_DNS` in the SMTP/Mail group with Required `no`, Default `true`, Set by compose `–`; a long-form section explaining what "ready to send" means, the 15-minute check and **Check again**, and why dev stacks set it to `false`), `apps/docs/admin-guide/domains.md` (section "Sending before the records are valid" becomes "Sending needs valid records": the gate, the API 422, deliveries waiting about two hours then failing, how to speed it up), `apps/docs/admin-guide/inbound-forms/deliveries.md` (the wait-then-fail path for an unverified domain and the error text on the delivery), `apps/docs/admin-guide/send-api.md` and `apps/docs/api/errors.md` (`FROM_DOMAIN_NOT_READY` now also means invalid DNS records; both messages), `apps/docs/api/overview.md` if it describes the code, `apps/docs/reference/roadmap.md` (remove "Unverified domains do send"), `apps/docs/reference/glossary.md` (new term "ready to send"), `apps/docs/installation/verify.md` (the test mail needs valid records now; point to **Check again**), `apps/docs/operations/troubleshooting.md` (new entry: `422 FROM_DOMAIN_NOT_READY` / deliveries pending with "DNS records that are not valid yet")

- [ ] **Step 1: Edit the pages** from the sources (`env.schema.ts`, `mail.service.ts`, `public-send.service.ts`, `inbound-form-delivery.service.ts`), keeping each page's conventions.
- [ ] **Step 2: Verify** — `pnpm build --filter docs` prints `environment.md covers all 48 variables` and finishes without dead links; `pnpm --filter docs test` passes.
- [ ] **Step 3: Commit.**

---

### Task 8: Refuse a `MAIL_HOSTNAME` switch into a customer's registrable domain

**Files:**

- Modify: `apps/backend/src/modules/domain/services/domain.service.ts` (`getDomainByRootDomain(rootDomain: string, excludeDomainId?: number): Promise<Domain | null>`), `domain.service.spec.ts`
- Modify: `apps/backend/src/modules/settings/services/settings.service.ts` (`reconcileSendingDomain`: after the exact-fqdn check compute `parse(this.mailHostname).domain` with `tldts` as `domain.service.ts` does and throw the Global-Constraints message when `getDomainByRootDomain(root, current.domainId)` finds a domain), `settings.service.spec.ts`
- Modify e2e: `apps/backend/test/settings.e2e-spec.ts` (new case next to "refuses to switch while MAIL_HOSTNAME is registered as a customer domain")
- Modify docs: `apps/docs/admin-guide/settings.md` (the "When MAIL_HOSTNAME changes" danger box: the backend refuses to start with the exact message; nothing is deleted; revert or delete the customer domain; the "Change MAIL_HOSTNAME" procedure's step 1 becomes this check, and a new `::: warning` says that with strict readiness every customer domain stops sending until its SPF include is updated and checked, so announce the switch to customers first), `apps/docs/operations/troubleshooting.md` (the `MAIL_HOSTNAME` entry: log line to look for, the two fixes), `apps/docs/installation/going-live.md` (one sentence in the warm-up/DMARC area or a new note: changing `MAIL_HOSTNAME` later interrupts customer sending), `apps/docs/reference/roadmap.md` (remove "A new MAIL_HOSTNAME under a customer's domain leaves no sending domain")

- [ ] **Step 1: Write the failing tests** — unit: `reconcileSendingDomain` with `MAIL_HOSTNAME` `mx.example.net`, a current sending domain `mx.example.com` and a customer domain `mail.example.net` (`rootDomain example.net`) rejects with `/shares the registrable domain example\.net with the customer domain mail\.example\.net/` and never calls `deleteDomain`; e2e: as the existing refusal test, with `domainModel().create({ fqdn: 'mail.<root of E2E_MAIL_HOSTNAME>', rootDomain: <root> })`, asserting the message and that the stale sending-domain row still exists.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — unit PASS, `pnpm --filter backend test:e2e` (settings suite) PASS.
- [ ] **Step 5: Docs** — the four pages; `pnpm build --filter docs`.
- [ ] **Step 6: Gate and commit.**

---

### Task 9: Final verification

- [ ] **Step 1:** `pnpm format:fix && pnpm check` — PASS.
- [ ] **Step 2:** `pnpm build` (backend, api, frontend, docs) — PASS; the docs build prints `covers all 48 variables`.
- [ ] **Step 3:** `pnpm --filter backend test:e2e` — PASS (all suites, including migrations 021 and 022).
- [ ] **Step 4:** `pnpm --filter frontend test:e2e` — PASS (the Playwright suite drives the domain pages; the stack runs with the gate off).
- [ ] **Step 5:** Report: files touched across all tasks, the two new migrations, the new env variable, and the pages updated; leave everything in the working tree for the owner to commit.
