# Server IPs from env Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server's public IPv4/IPv6 addresses come from `MAIL_SERVER_IPV4` / `MAIL_SERVER_IPV6` in the environment instead of the admin UI, and the backend creates or updates the sending domain from env alone when it starts.

**Architecture:** `SettingsService.reconcileSendingDomain` (already run in `onApplicationBootstrap` under `SENDING_DOMAIN_LOCK_KEY`) grows from "switch a stale FQDN" to the only path that writes the sending domain: create it when missing, switch it when `MAIL_HOSTNAME` changed, regenerate its records in place when the configured addresses differ from the A/AAAA records it has. The applied addresses are read from the sending domain's own A/AAAA records, so the `settings.serverIpv4`/`serverIpv6` columns, `PUT /settings/sending-domain`, `GET /settings/sending-domain/proposal` and the wizard's "Sending domain" step go away. `GET /settings` keeps returning `serverIpv4`/`serverIpv6`, now from config, and the Settings card turns read-only.

**Tech Stack:** NestJS 12 + Sequelize + Zod env schema, umzug migrations, Vue 3 + Vuetify + TanStack Query, Playwright, VitePress.

**Spec:** The design agreed in the conversation of 2026-11-05 (no separate file): IPs move to env like `MAIL_HOSTNAME`; deriving them from DNS is rejected because the A record may not be the egress IP (Cloudflare proxy, floating IP).

## Global Constraints

- Env keys: `MAIL_SERVER_IPV4` (required, IPv4) and `MAIL_SERVER_IPV6` (optional, IPv6; empty string = unset). Trim whitespace. No defaults.
- Every repo rule from `CLAUDE.md` applies: no comments, read before write, `pnpm typecheck` + `pnpm lint` green, tests updated with logic, docs in `apps/docs` updated in the same change, **never touch git** (no step in this plan stages or commits).
- `.env.example` files hold only required keys and non-default values: add `MAIL_SERVER_IPV4` to both; never add `MAIL_SERVER_IPV6` to either.
- Do not edit the owner's local `.env`; the final report tells the owner to add `MAIL_SERVER_IPV4=<ip>` there (the dev backend refuses to start without it).
- Log lines name the domain FQDN and IPs only (no e-mail addresses), errors via `describeError`.
- The e2e/test IPv4 is `203.0.113.10`, the IPv6 (where used) `2001:db8::10`.

## Review Focus

1. **Restart with unchanged env** must not touch the records (no status reset to invalid, no new DKIM): covered by the unit test "leaves … untouched" and the e2e restart test in Task 2.
2. **IPv6 removed from env** (was set, now empty) must drop the AAAA and IPv6 PTR records and the `ip6:` SPF mechanism: unit test in Task 1.
3. **First start with `MAIL_HOSTNAME` already registered as a customer domain** must refuse with the existing message instead of crashing on a unique constraint: unit test in Task 1.
4. **Rolling back** (migration 023 `down`) must give the old code a `settings` row it can save, with the IPs restored from the records: migration e2e test in Task 1.
5. **An invalid `MAIL_SERVER_IPV4`** (e.g. `999.1.1.1`, an IPv6 address, empty) must stop the start with a schema error naming the key: env schema tests in Task 1.

---

### Task 1: Backend — env keys, reconcile from env, endpoint and column removal

**Files:**

- Modify: `apps/backend/src/config/env.schema.ts`, `apps/backend/src/config/env.schema.spec.ts`
- Modify: `apps/backend/src/modules/settings/services/settings.service.ts`, `settings.service.spec.ts`
- Modify: `apps/backend/src/modules/settings/controller/settings.controller.ts`, `settings.controller.spec.ts`
- Delete: `apps/backend/src/modules/settings/dtos/sending-domain-configure.dto.ts`, `sending-domain-configure.dto.spec.ts`, `sending-domain-proposal.dto.ts`
- Modify: `apps/backend/src/modules/settings/interfaces/settings.interface.ts`, `models/settings.model.ts`
- Modify: `apps/backend/src/modules/setup/setup.constants.ts`, `services/setup.service.ts`, `services/setup.service.spec.ts`
- Modify: `apps/backend/src/route-access.spec.ts:190-191`
- Create: `apps/backend/src/migrations/023-remove-settings-server-ips.ts`
- Create: `apps/backend/test/settings-server-ips-migration.e2e-spec.ts` (pattern: `test/domain-dns-issue-migration.e2e-spec.ts`)
- Modify: `.env.example` (root)

**Interfaces:**

- Produces: env keys `MAIL_SERVER_IPV4: string`, `MAIL_SERVER_IPV6: string | undefined` on `Env`.
- Produces: `Settings` without `serverIpv4`/`serverIpv6`; `SettingsCreate = Pick<Settings, 'sendingDomainId'>`. `SendingDomain` keeps `serverIpv4: string`, `serverIpv6: string | null` (filled from config). `SendingDomainProposal` is deleted.
- Produces: `SettingsService.reconcileSendingDomain(): Promise<void>` (public, unchanged name, now also creates/updates). `configureSendingDomain` and `getSendingDomainProposal` are deleted.
- Produces: `SETUP_STEPS = ['account', 'records', 'finished'] as const`; `getStep()` returns `'records'` once a user exists and setup is unfinished, whether or not a sending domain exists.
- Produces: HTTP — `PUT /api/settings/sending-domain` and `GET /api/settings/sending-domain/proposal` no longer exist; `GET /api/settings` and `POST /api/settings/sending-domain/refresh` unchanged in shape.

- [ ] **Step 1: Write the failing env schema tests** in `env.schema.spec.ts` (use the file's existing base-env helper and add `MAIL_SERVER_IPV4: '203.0.113.10'` to it):
    - `it('requires MAIL_SERVER_IPV4 as an IPv4 address')` — missing, `''`, `'999.1.1.1'`, `'2001:db8::10'` each fail with an issue whose path is `['MAIL_SERVER_IPV4']`; `' 203.0.113.10 '` parses to `'203.0.113.10'`.
    - `it('keeps MAIL_SERVER_IPV6 optional and validates it as IPv6')` — missing and `''` give `undefined`; `'2001:db8::10'` passes through; `'203.0.113.10'` fails with path `['MAIL_SERVER_IPV6']`.

- [ ] **Step 2: Run** `pnpm --filter backend exec vitest run src/config/env.schema.spec.ts` — Expected: the two new tests FAIL.

- [ ] **Step 3: Add `MAIL_SERVER_IPV4` and `MAIL_SERVER_IPV6` to `envShape`** directly below `MAIL_HOSTNAME` (Zod 4 `z.ipv4()` / `z.ipv6()` behind a trim; IPv6 reuses the empty-to-undefined idea of `optionalString`). Add `MAIL_SERVER_IPV4=203.0.113.10` below `MAIL_HOSTNAME` in the root `.env.example`.

- [ ] **Step 4: Run** the env spec plus `src/config/env-keys.spec.ts` — Expected: PASS.

- [ ] **Step 5: Rewrite the `SettingsService` unit tests** (`settings.service.spec.ts`). Config mock gains `MAIL_SERVER_IPV4: '203.0.113.10'`, `MAIL_SERVER_IPV6: undefined` (tests that need IPv6 build the service with `'2001:db8::10'`). Sending-domain fixtures carry A (and where relevant AAAA) records in `dnsRecords` whose `value` is the applied address. Delete the `getSendingDomainProposal` and `configureSendingDomain` describes. Under `describe('reconcileSendingDomain')`:
    - `'creates the MAIL_HOSTNAME sending domain and the settings row from the configured addresses'` — no settings row → `createSendingDomain(MAIL_HOSTNAME, { serverIpv4: '203.0.113.10', serverIpv6: null })`, `settingsModel.create({ sendingDomainId: 10 }, …)`, `regenerateCustomerSpfRecords` called with the new domain.
    - `'creates the sending domain for a settings row without one'` — row with `sendingDomainId: null` → row updated to the new id and saved, no second row created.
    - `'refuses to create the sending domain while MAIL_HOSTNAME is registered as a customer domain'` — no settings row, `getDomainByFqdn` resolves a domain → rejects with `/registered as a customer domain/`, `createSendingDomain` not called.
    - `'leaves a sending domain that matches MAIL_HOSTNAME and the configured addresses untouched'` — no create/recreate/delete/save calls.
    - `'regenerates the records in place when MAIL_SERVER_IPV4 changed'` — stored A `203.0.113.20` → `recreateSendingDomainRecords(MAIL_HOSTNAME, { serverIpv4: '203.0.113.10', serverIpv6: null })`; `createSendingDomain`, `deleteDomain`, `regenerateCustomerSpfRecords` not called; logger.warn names `MAIL_HOSTNAME`.
    - `'regenerates the records when MAIL_SERVER_IPV6 was added'` — stored A only, env IPv6 `2001:db8::10` → recreate with `serverIpv6: '2001:db8::10'`.
    - `'regenerates the records when MAIL_SERVER_IPV6 was removed'` — stored AAAA `2001:db8::10`, env IPv6 unset → recreate with `serverIpv6: null`.
    - Keep and adapt `'switches a stale sending domain to MAIL_HOSTNAME …'` (now with the configured addresses, not stored ones) and both existing refusal tests.
    - `describe('getSendingDomain')`: `'reports the configured addresses'` → `serverIpv4: '203.0.113.10'`, `serverIpv6: null` regardless of the records.
    - Keep `onApplicationBootstrap` / `finishSetup` / `refreshSendingDomain` tests, minus IP fields on settings rows.

- [ ] **Step 6: Run** `pnpm --filter backend exec vitest run src/modules/settings` — Expected: FAIL (new behaviour missing).

- [ ] **Step 7: Implement in `settings.service.ts`:**
    - Constructor reads `MAIL_SERVER_IPV4`/`MAIL_SERVER_IPV6` into one `private readonly serverIps: SendingDomainIps` (`serverIpv6: … ?? null`). Drop the `resolve4`/`resolve6` import and `firstAddress`.
    - `reconcileSendingDomain()` under the lock: no row or no `sendingDomainId` → run the two existing conflict checks (customer domain with that FQDN; other domain under the registrable domain, no exclusion) then create. FQDN differs → existing checks + switch. Same FQDN → compare `appliedIps(current.dnsRecords)` with `serverIps`; on difference warn `Server addresses of sending domain ${fqdn} changed to ${…}, regenerating its DNS records` and call `recreateSendingDomainRecords`. Same → return.
    - `private appliedIps(records: DomainDnsRecord[]): SendingDomainIps` — `value` of the `DomainDnsRecordUse.A` record, `value` of the `AAAA` record or `null`.
    - `applySendingDomain()` uses `this.serverIps`, writes only `sendingDomainId`; `toSendingDomain(domain)` takes the IPs from `this.serverIps`.
    - Delete `configureSendingDomain`, `getSendingDomainProposal`.

- [ ] **Step 8: Remove the endpoints and leftovers:** in `settings.controller.ts` delete `getSendingDomainProposal` and `configureSendingDomain` (and their spec cases); delete the three DTO files; drop the IP fields from `Settings`, `SettingsCreate` and `SettingsModel`; delete `SendingDomainProposal`; remove the two route entries in `route-access.spec.ts`; in `setup.constants.ts`/`setup.service.ts` drop `'sendingDomain'` (`getStep` no longer reads `sendingDomainId`; `finishSetup` keeps its 409 guard in `SettingsService`) and update `setup.service.spec.ts` (`'reports the records step once an account exists, even without a sending domain'`, IP fields removed from fixtures).

- [ ] **Step 9: Run** `pnpm --filter backend test` — Expected: PASS.

- [ ] **Step 10: Write the migration e2e test** `test/settings-server-ips-migration.e2e-spec.ts`, `describe('023 remove settings server ips (e2e)')`, migrating a fresh database up to just before `023-remove-settings-server-ips.ts` as the 022 spec does:
    - `'drops the server address columns'` — after `up`, `describeTable('settings')` has no `serverIpv4`/`serverIpv6`.
    - `'restores the addresses from the sending domain records when reverted'` — seed (after `up`) a domain `mail.migration.test`, `domain_dns` rows `{use:'a', value:'203.0.113.10'}` and `{use:'aaaa', value:'2001:db8::10'}`, a settings row pointing at it, plus a second settings row with `sendingDomainId` null; after `down`: first row `serverIpv4 = '203.0.113.10'`, `serverIpv6 = '2001:db8::10'`; second row `serverIpv4 = '0.0.0.0'`, `serverIpv6` null; `serverIpv4` is `NOT NULL`.

- [ ] **Step 11: Implement `023-remove-settings-server-ips.ts`** — `up`: drop both columns. `down`: add both as nullable `VARCHAR(45)`, backfill each from the sending domain's `a` / `aaaa` record in one `UPDATE … FROM` per column, set remaining null `serverIpv4` to `'0.0.0.0'`, then `SET NOT NULL` on `serverIpv4`.

- [ ] **Step 12: Run** `pnpm --filter backend exec vitest run --project e2e test/settings-server-ips-migration.e2e-spec.ts test/schema.e2e-spec.ts test/migrations.e2e-spec.ts` — Expected: PASS. (Other e2e files are adapted in Task 2.)

- [ ] **Step 13: Run** `pnpm --filter backend typecheck` and `pnpm --filter backend lint` — Expected: no errors.

---

### Task 2: Backend e2e suite on env-provisioned sending domain

**Files:**

- Modify: `apps/backend/test/support/infrastructure.ts` (env `MAIL_SERVER_IPV4: '203.0.113.10'`)
- Modify: `apps/backend/test/support/sending-domain.ts`
- Modify: `apps/backend/test/settings.e2e-spec.ts`, `test/setup.e2e-spec.ts`
- Modify (call sites only): `test/bounce`, `domain`, `inbound-form-management`, `inbound-form`, `permission`, `project`, `public-send`, `send-gate` `.e2e-spec.ts`

**Interfaces:**

- Consumes: `SettingsService.reconcileSendingDomain()` from Task 1.
- Produces: `ensureSendingDomain(app: INestApplication<App>): Promise<void>` in `test/support/sending-domain.ts` (calls `app.get(SettingsService).reconcileSendingDomain()`), replacing `configureSendingDomain(app, token)`; `E2E_MAIL_HOSTNAME` stays; add `export const E2E_SERVER_IPV4 = '203.0.113.10'` and use it in `infrastructure.ts`.

- [ ] **Step 1: Swap the helper** and replace every `configureSendingDomain(app, token)` call with `ensureSendingDomain(app)`.

- [ ] **Step 2: Rewrite `settings.e2e-spec.ts`:**
    - Delete `'proposes MAIL_HOSTNAME …'`. Replace `'no longer accepts a domain name in the configuration'` with `'no longer offers the configuration endpoints'` — `PUT /api/settings/sending-domain` with `{ serverIpv4 }` and `GET /api/settings/sending-domain/proposal` both answer 404.
    - Replace the configure test with `'creates MAIL_HOSTNAME as the sending domain from MAIL_SERVER_IPV4'` — `ensureSendingDomain(app)`, then `GET /api/settings`: `fqdn` `E2E_MAIL_HOSTNAME`, `serverIpv4` `'203.0.113.10'`, `serverIpv6` null, record uses `['a','dkim','dmarc','mx','ptr','spf']`, SPF `v=spf1 ip4:203.0.113.10 -all`.
    - Replace the address-change test with `'regenerates the records when the stored addresses differ from the configuration'` — set the customer SPF valid as today, update the sending domain's A record `value` to `'203.0.113.99'` and SPF to `v=spf1 ip4:203.0.113.99 -all`, call `ensureSendingDomain(app)`; A and SPF are back at `203.0.113.10`, `domainId` and DKIM unchanged, customer SPF still `valid` with `issue` null.
    - Add `'keeps the records on a restart with unchanged configuration'` — mark every sending-domain record `valid`, restart via `createTestApp()` as the stale-switch test does, records still `valid` and same ids.
    - Stale-switch test expects `serverIpv4: '203.0.113.10'`.

- [ ] **Step 3: Adapt `setup.e2e-spec.ts`:** after registration `GET /api/setup/status` is `{ needsSetup: true, step: 'records' }`; `'refuses to finish the setup before a sending domain exists'` stays (409, settings/domains were destroyed in `beforeAll`); then `ensureSendingDomain(app)` and the finish tests run as before. Delete the `'sendingDomain'` step assertion.

- [ ] **Step 4: Run** `pnpm --filter backend test:e2e` — Expected: all files PASS.

- [ ] **Step 5: Run** `pnpm --filter backend typecheck` and `pnpm --filter backend lint` — Expected: no errors.

---

### Task 3: API client, frontend and Playwright stack

**Files:**

- Regenerate: `pnpm build --filter api`
- Delete: `apps/frontend/src/modules/settings/mutations/useSendingDomainMutation.ts` + spec, `queries/useSendingDomainProposalQuery.ts` + spec
- Modify: `apps/frontend/src/modules/settings/components/SendingDomainCard.vue`, `views/SettingsView.vue`, `views/__tests__/SettingsView.spec.ts`
- Modify: `apps/frontend/src/modules/onboarding/components/setupStep.ts`, `SetupStepper.vue`, `views/OnboardingView.vue`, `views/partials/OnboardingRecordsStep.vue`, `views/__tests__/OnboardingView.spec.ts`
- Modify: `apps/frontend/src/locales/en.json`
- Modify: `packages/e2e-stack/src/stack.ts`, `src/infrastructure.ts`; `apps/frontend/e2e/support/global-setup.ts`; `apps/frontend/e2e/01-onboarding.spec.ts`
- Check: `DashboardView.spec.ts`, `AppLayout.spec.ts`, `useSendingDomainRefreshMutation.spec.ts`, `useSetupStatusQuery.spec.ts` compile against the new types

**Interfaces:**

- Consumes: the API from Task 1 (`SetupStatusDto.step` is `'account' | 'records' | 'finished'`; no `configureSendingDomain`/`getSendingDomainProposal` in `SettingsApi`).
- Produces: `SetupStepKey = 'account' | 'records'`; `SendingDomainCard` props `{ sendingDomain: SendingDomainDto }`, no emits.
- Produces: `startStack` options gain `serverIpv4: string` and `serverIpv6?: string`, passed as `MAIL_SERVER_IPV4`/`MAIL_SERVER_IPV6` (`BackendEnv` gets both keys; IPv6 as `''` when absent).

- [ ] **Step 1: Regenerate the client** — `pnpm build --filter api`; Expected: success, `SendingDomainConfigureDto` and `SendingDomainProposalDto` gone from `packages/api/dist`.

- [ ] **Step 2: Update the frontend specs first:**
    - `SettingsView.spec.ts`: `'shows the sending domain and its addresses read-only'` — the card shows the FQDN, `203.0.113.10`, `2001:db8::10` and the hint text of `module.settings.sendingDomain.domainHint`, and renders no `input[name="serverIpv4"]` for any role. Remove save/confirm/dirty-guard cases for the card.
    - `OnboardingView.spec.ts`: two stepper steps (`Admin account`, `DNS records`); status `records` with a sending domain shows `OnboardingRecordsStep`; no back button on the records step; remove the sending-domain step cases.

- [ ] **Step 3: Run** `pnpm --filter frontend exec vitest run src/modules/settings src/modules/onboarding` — Expected: FAIL.

- [ ] **Step 4: Implement:**
    - `SendingDomainCard.vue`: only the read-only grid (`ReadonlyValue` for domain, IPv4, IPv6) plus the hint paragraph; drop form, vee-validate, mutation, proposal query, confirm, dirty guard, footer.
    - `SettingsView.vue`: render both cards under `v-if="settings.sendingDomain"`; drop `:can-update` on the domain card (the records card keeps its refresh permission).
    - Onboarding: `SetupStepKey` and stepper `order` without `'sendingDomain'`; `OnboardingView` loses the `SendingDomainCard` branch, `onDomainSaved` and the `'sendingDomain'` mapping in `reached`; `OnboardingRecordsStep` loses the back button and the `back` emit.
    - `en.json`: delete `module.setup.steps.sendingDomain`, `module.setup.intro.sendingDomain`, `module.setup.domain`, `module.settings.sendingDomain.{addressHint,saved,error,confirm}`; set `module.setup.intro.account.lead` to `"Let's set up this server. It takes two steps and a few DNS records."`, `field.serverIpv6` to `"Server IPv6 address"`, `module.settings.sendingDomain.description` to `"The host name and IP addresses this server sends mail from."`, `module.settings.sendingDomain.domainHint` to `"Set by MAIL_HOSTNAME, MAIL_SERVER_IPV4 and MAIL_SERVER_IPV6 in the server configuration. Change them there and restart the server."`. Remove any other key left unused (grep each deleted path).

- [ ] **Step 5: Run** `pnpm --filter frontend test` — Expected: PASS.

- [ ] **Step 6: Stack and Playwright:** add the `startStack` options and env keys; `apps/frontend/e2e/support/global-setup.ts` passes `serverIpv4: '203.0.113.10'`; export `serverIpv4` next to `sendingDomain` in `e2e/support/fixtures.ts`. In `01-onboarding.spec.ts` replace the IP-entry steps: after account creation the wizard is on **Publish the DNS records** and the A record row shows `203.0.113.10`; remove the invalid-IP check. So the docs workspace keeps compiling, update `apps/docs/screenshots/global-setup.ts` to pass `serverIpv4: '203.0.113.10', serverIpv6: '2001:db8::10'` and delete the `SettingsApi.configureSendingDomain` call in `apps/docs/screenshots/seed.ts:109`. The screenshot flow itself changes in Task 4.

- [ ] **Step 7: Run** `pnpm --filter frontend test:e2e` — Expected: PASS.

- [ ] **Step 8: Run** `pnpm --filter frontend lint`, `pnpm --filter frontend typecheck`, `pnpm --filter e2e-stack typecheck` (or `pnpm typecheck`) — Expected: no errors.

---

### Task 4: Production stack, docs and screenshots

**Files:**

- Modify: `deploy/.env.example` (add `MAIL_SERVER_IPV4=` below `MAIL_HOSTNAME=`)
- Modify: `e2e/smoke/support/stack.ts` (env line `MAIL_SERVER_IPV4=203.0.113.10`)
- Modify: `apps/docs/configuration/environment.md` (rows for both keys in the compose-level `.env` table near `MAIL_HOSTNAME` and in the backend table near line 94), `configuration/without-docker.md`
- Modify: `apps/docs/installation/docker-compose.md` (`.env` table rows, the `sed` commands, the `cat .env` example), `installation/dns.md` (line 44 and the IP lookup at line ~72: note the address for `MAIL_SERVER_IPV4`), `installation/first-run-setup.md` (two steps; delete "Step 2: Sending domain", renumber, intro sentence; record counts unchanged)
- Modify: `apps/docs/admin-guide/settings.md` ("The Sending domain card" read-only; "Change the server IP addresses" becomes: update DNS/PTR → set `MAIL_SERVER_IPV4`/`MAIL_SERVER_IPV6` in `.env` → `docker compose up -d`; "How you know it worked" shows the new log line `Server addresses of sending domain mx.example.com changed …`)
- Modify: any other page a `grep -rn -i "Sending domain step\|three steps\|Server IPv4 address\|IP addresses" apps/docs --include=*.md` hit describes the old wizard or UI entry (candidates: `introduction/how-it-works.md`, `installation/verify.md`, `reference/glossary.md`, `operations/troubleshooting.md`)
- Modify: `apps/docs/screenshots/pages.screenshots.ts` (drop the domain-step shot and the IP entry before the records shot); delete `apps/docs/public/screenshots/installation/onboarding-domain.png`
- Modify: `CLAUDE.md` (env list: `MAIL_SERVER_IPV4` required, `MAIL_SERVER_IPV6` optional; the `MAIL_HOSTNAME` paragraph: the sending domain and its records are created and kept in step with `MAIL_HOSTNAME`/`MAIL_SERVER_IPV*` by `SettingsService.onApplicationBootstrap`; no settings API for IPs; e2e note `E2E_SERVER_IPV4` / Playwright `serverIpv4`)

**Interfaces:**

- Consumes: `startStack({ serverIpv4, serverIpv6 })` from Task 3; log message text from Task 1 Step 7.

- [ ] **Step 1: Edit `deploy/.env.example`, the smoke env and the docs pages listed above.** `compose.yml` stays unchanged (the backend reads both keys through `env_file`, and the schema rejects a missing IPv4).

- [ ] **Step 2: Run** `pnpm --filter docs test` and `pnpm build --filter docs` — Expected: PASS (env-reference check sees both keys documented, no dead links, no missing screenshot).

- [ ] **Step 3: Regenerate screenshots** — `pnpm --filter docs screenshots`; Expected: success; `onboarding-records.png` and the Settings screenshot show the new UI. Check `admin-guide/settings.md`'s image alt text still matches.

- [ ] **Step 4: Run the smoke test** from Git Bash: `docker build -t ghcr.io/schwarzdavid/mailer:local .` then `IMAGE_TAG=local pnpm --filter e2e test:smoke` — Expected: PASS.

- [ ] **Step 5: Full gate** — `pnpm check` — Expected: PASS.
