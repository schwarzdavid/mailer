# Inbound Form Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind inbound forms to the owner's websites, harden reCAPTCHA, fix honeypots to the body, add a time-delayed single-use token scheme with a tiny client script, rate-limit per IP and form, and replace the HTML example with a fetch example plus per-scheme integration dialogs.

**Architecture:** A new `allowedHostnames` column on `inbound_forms` feeds a pure origin helper used on submit and token issuance, and the reCAPTCHA hostname check. A new `InboundFormTokenService` signs stateless HMAC tokens (key derived from `BACKEND_ENCRYPTION_SECRET`) and consumes nonces atomically on the throttler's ioredis client. The client script is a self-contained TS function served as JS by the public controller. The frontend gets a hostname editor, an extended security dialog, and pure snippet builders behind an info dialog.

**Tech Stack:** NestJS 12 (ESM), Sequelize/Postgres, `@nestjs/throttler` + ioredis, Node `crypto`; Vue 3 + Vuetify + vee-validate/Zod + vue-i18n; Vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-inbound-form-hardening-design.md`

## Global Constraints

- **Never touch git** (CLAUDE.md). Every "Commit" step in this plan is replaced by: leave changes uncommitted; the owner handles git.
- **No comments** in code; existing _why_-comments are the bar.
- Backend ESM: relative imports end in `.js`; singular associations use `Relation<>`.
- Test doubles: `vi.fn<Service['method']>()`, typed inputs, no `as` casts (CLAUDE.md "Testing").
- Every task ends green on its package: `pnpm --filter backend typecheck && pnpm --filter backend lint` / same for `frontend`.
- After any endpoint/DTO change: `pnpm --filter backend generate` then `pnpm --filter api build`.
- Spec values: `minDelaySeconds` 1–60 default 3; `maxAgeSeconds` 60–86400 default 3600; `expectedAction` max 100 chars; token issuance 5 per 10 min per IP+slug; submit 5 per 10 min per IP+slug; HKDF info `inbound-form-token`; Redis key `inbound-form-token:<nonce>`; nonce 128-bit; client script at `GET /api/public/form/client.js`; global function `InboundForm.getToken(slug): Promise<string>`.
- Hostnames: lowercased, trimmed, deduplicated, exact match only, no wildcard/scheme/port/path, `localhost` allowed.
- New forms get no security scheme by default; the timed-token scheme and client script are added manually.
- i18n: global `src/locales/en.json` only, feature copy under `module.inboundForms.*`.

## Review Focus

1. **`Origin: null` / both headers missing with a non-empty list** — must be 403, not a pass. Pinned in Task 3.
2. **`Origin` with port or uppercase (`https://Kunde.at:8443`)** — hostname compare must ignore port and case. Pinned in Task 3.
3. **A failed field validation or captcha after a valid token must not burn the nonce** — the retry with the same token must still pass. Pinned in Task 5.
4. **Redis down during nonce consumption** — must be 403 (fail closed), while throttling stays fail-open. Pinned in Task 4.
5. **Clearing the hostname list while a timed-token scheme exists** — must be 400, otherwise any site can fetch tokens. Pinned in Task 2.

---

### Task 1: Allowed hostnames on the form + migration

**Files:**

- Create: `apps/backend/src/migrations/017-harden-inbound-forms.ts`
- Create: `apps/backend/src/modules/inbound-form/helpers/hostname.ts`
- Test: `apps/backend/src/modules/inbound-form/helpers/hostname.spec.ts`
- Modify: `apps/backend/src/modules/inbound-form/models/inbound-form.model.ts`
- Modify: `apps/backend/src/modules/inbound-form/interfaces/inbound-form.interface.ts`
- Modify: `apps/backend/src/modules/inbound-form/dtos/inbound-form.dto.ts`, `dtos/inbound-form-create.dto.ts` (`InboundFormUpdateDto`)
- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form.service.ts` (`InboundFormUpdateRequest`, `FORM_UPDATABLE_KEYS`, `updateForm`)
- Test: `apps/backend/src/modules/inbound-form/services/inbound-form.service.spec.ts`, `test/migrations.e2e-spec.ts` (or a new `test/inbound-form-hardening-migration.e2e-spec.ts` following `recaptcha-secret-migration.e2e-spec.ts`)

**Interfaces:**

- Produces: `normalizeHostname(value: string): string | null` (null = invalid); `InboundForm.allowedHostnames: string[]`; `InboundFormDto.allowedHostnames: string[]`; `InboundFormUpdateDto.allowedHostnames?: string[]` (`@IsArray() @IsString({ each: true }) @ArrayMaxSize(50)`).

- [ ] **Step 1: Write failing tests for `normalizeHostname`**

```ts
it.each([
    ['Kunde.AT ', 'kunde.at'],
    ['www.kunde.at', 'www.kunde.at'],
    ['localhost', 'localhost'],
])('normalizes %s', (input, expected) => expect(normalizeHostname(input)).toBe(expected))

it.each(['https://kunde.at', 'kunde.at:8080', 'kunde.at/path', '*.kunde.at', '-a.at', '', 'a..at'])(
    'rejects %s',
    (input) => expect(normalizeHostname(input)).toBeNull(),
)
```

- [ ] **Step 2: Run** `pnpm --filter backend exec vitest run src/modules/inbound-form/helpers/hostname.spec.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement `normalizeHostname`** — trim + lowercase, then match labels `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$` joined by single dots, total length ≤ 253.
- [ ] **Step 4: Run the test** — Expected: PASS.
- [ ] **Step 5: Write the migration** `017-harden-inbound-forms.ts`: `up` adds `inbound_forms."allowedHostnames" TEXT[] NOT NULL DEFAULT '{}'`, runs `UPDATE inbound_form_security SET location = 'body' WHERE type = 'honeypot'` and `DELETE FROM inbound_form_security WHERE type = 'csrf'`; `down` drops the column only. Register it the way `migrate.ts` imports the existing ones.
- [ ] **Step 6: Add a migration e2e test** (pattern of `recaptcha-secret-migration.e2e-spec.ts`): seed a header honeypot and a csrf row before `017`, run up, assert the honeypot is `body`, the csrf row is gone, and an existing form has `allowedHostnames = []`.
- [ ] **Step 7: Add the model column** (`DataType.ARRAY(DataType.STRING(253))`, `AllowNull(false)`, default `[]`), interface field, DTO field (`@ApiProperty({ type: [String] })`), mapper in `fromInboundForm`, and `allowedHostnames` in `InboundFormUpdateRequest` + `FORM_UPDATABLE_KEYS`.
- [ ] **Step 8: Write failing service tests** in `inbound-form.service.spec.ts` under `updateForm`:
    - `'normalizes and deduplicates allowed hostnames'` — update `[' Kunde.at', 'kunde.at', 'www.kunde.at']` → `form.update` called with `allowedHostnames: ['kunde.at', 'www.kunde.at']`.
    - `'rejects an invalid hostname'` — `['https://kunde.at']` → `BadRequestException` with message `Invalid hostname: https://kunde.at`.
- [ ] **Step 9: Implement in `updateForm`**: map through `normalizeHostname`, throw `BadRequestException(\`Invalid hostname: ${raw}\`)` on null, dedupe preserving order.
- [ ] **Step 10: Run** `pnpm --filter backend exec vitest run src/modules/inbound-form` and `pnpm --filter backend test:e2e -- inbound-form-hardening-migration` — Expected: PASS. Typecheck + lint backend.
- [ ] **Step 11: Commit** — skipped (owner handles git).

---

### Task 2: Security scheme model changes (types, config, rules)

**Files:**

- Modify: `apps/backend/src/modules/inbound-form/interfaces/inbound-form-security.interface.ts`
- Modify: `apps/backend/src/modules/inbound-form/models/inbound-form-security.model.ts` (config type)
- Modify: `apps/backend/src/modules/inbound-form/dtos/inbound-form-security.dto.ts`
- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form.service.ts` (`replaceSecurity`, `toStoredSecurityConfig`, `updateForm`)
- Test: `services/inbound-form.service.spec.ts`, `dtos/inbound-form-security.dto.spec.ts`, `services/inbound-form-security.service.spec.ts` (drop the csrf case)

**Interfaces:**

- Produces:
    - `InboundFormSecurityType`: `RECAPTCHA = 'google-recaptcha'`, `HONEYPOT = 'honeypot'`, `TIMED_TOKEN = 'timed-token'` (`CSRF` removed).
    - `InboundFormRecaptchaStoredConfig { encryptedSecret: string; minScore?: number; expectedAction?: string }`
    - `InboundFormTimedTokenConfig { minDelaySeconds: number; maxAgeSeconds: number }`
    - `InboundFormSecurityStoredConfig = InboundFormRecaptchaStoredConfig | InboundFormTimedTokenConfig`; `InboundFormSecurity.config: InboundFormSecurityStoredConfig | null`.
    - `InboundFormSecurityConfigInput { secret?; minScore?; expectedAction?; minDelaySeconds?; maxAgeSeconds? }` (replaces `InboundFormRecaptchaConfigInput`).
    - DTOs (my call, flat instead of a discriminated union — keeps the OpenAPI/Zod output simple): `InboundFormSecurityConfigUpsertDto` (replaces `InboundFormRecaptchaConfigUpsertDto`; adds `expectedAction` `@IsString() @MaxLength(100)`, `minDelaySeconds` `@IsInt() @Min(1) @Max(60)`, `maxAgeSeconds` `@IsInt() @Min(60) @Max(86400)`, all optional) and `InboundFormSecurityConfigDto` (replaces `InboundFormRecaptchaConfigDto`; all fields optional: `hasSecret`, `minScore`, `expectedAction`, `minDelaySeconds`, `maxAgeSeconds`; `fromConfig(type, config)`). Every primitive gets an explicit `@ApiProperty` (see memory: bare primitives can generate as `object`).
    - Type guards `isRecaptchaConfig(config)` / `isTimedTokenConfig(config)` exported from the interface file's sibling `helpers/security-config.ts`.

- [ ] **Step 1: Write failing `replaceSecurity` tests:**
    - `'rejects a honeypot outside the body'` — `{ type: HONEYPOT, location: HEADER }` → `BadRequestException('Honeypots must use the body location')`.
    - `'stores the expected action for recaptcha'` — config `{ secret: 's', expectedAction: 'contact' }` → stored `{ encryptedSecret, expectedAction: 'contact' }`.
    - `'stores timed-token defaults'` — form with `allowedHostnames: ['kunde.at']`, config `null` → stored `{ minDelaySeconds: 3, maxAgeSeconds: 3600 }`; config `{ minDelaySeconds: 10, maxAgeSeconds: 600 }` → stored as given.
    - `'rejects a timed token without allowed hostnames'` → `BadRequestException('The timed token requires allowed domains')`.
    - Replace the old `'rejects the csrf type'` test (type no longer exists).
- [ ] **Step 2: Write failing `updateForm` test** `'refuses to clear hostnames while a timed token is configured'` → `BadRequestException('Allowed domains cannot be cleared while the timed token is enabled')`.
- [ ] **Step 3: Write failing DTO spec cases** for `InboundFormSecurityConfigDto.fromConfig`: recaptcha → `{ hasSecret: true, minScore, expectedAction }`; timed token → `{ minDelaySeconds, maxAgeSeconds }`, no `hasSecret`.
- [ ] **Step 4: Run** `pnpm --filter backend exec vitest run src/modules/inbound-form` — Expected: FAIL.
- [ ] **Step 5: Implement**: enum/interface/DTO changes; `toStoredSecurityConfig` branches on type (recaptcha: as today + `expectedAction`; timed token: defaults 3/3600; honeypot: `null`); the honeypot-location and hostname-precondition checks in `replaceSecurity`; the clear-guard in `updateForm` (only when the resulting list is empty and a `TIMED_TOKEN` row exists). Update `SecurityCard`-independent callers that referenced the renamed types (`grep -rn "RecaptchaConfig" apps/backend/src`).
- [ ] **Step 6: Run tests** — Expected: PASS. Regenerate the API (`pnpm --filter backend generate && pnpm --filter api build`); run `pnpm --filter frontend typecheck` and note the breakages it reports for Tasks 7–8 (do not fix the frontend here beyond renaming imported types so the build stays green).
- [ ] **Step 7: Commit** — skipped.

---

### Task 3: Origin check and reCAPTCHA hardening

**Files:**

- Create: `apps/backend/src/modules/inbound-form/helpers/origin.ts`
- Test: `apps/backend/src/modules/inbound-form/helpers/origin.spec.ts`
- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form-security.service.ts`
- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form-submission.service.ts` (pass `allowedHostnames`)
- Test: `services/inbound-form-security.service.spec.ts`, `services/inbound-form-submission.service.spec.ts`

**Interfaces:**

- Consumes: `normalizeHostname` (Task 1), `isRecaptchaConfig` (Task 2).
- Produces:
    - `requestHostname(headers: Record<string, unknown>): string | null` — hostname of `origin`, else of `referer`; `null` for missing, `'null'`, or unparseable.
    - `isOriginAllowed(allowedHostnames: string[], headers: Record<string, unknown>): boolean` — `true` when the list is empty.
    - `SecurityRequestContext` gains `allowedHostnames: string[]` and `ip: string`.
    - `checkSubmission` throws `ForbiddenException('Origin not allowed')` first.

- [ ] **Step 1: Write failing helper tests** — `'https://Kunde.at:8443'` → `kunde.at`; origin missing + referer `https://kunde.at/kontakt` → `kunde.at`; `origin: 'null'` and no referer → `null`; `isOriginAllowed([], {})` → `true`; `isOriginAllowed(['kunde.at'], {})` → `false`; `isOriginAllowed(['kunde.at'], { origin: 'https://evil.at' })` → `false`.
- [ ] **Step 2: Write failing security-service tests:**
    - `'rejects a foreign origin before the honeypot'` — honeypot filled + foreign origin → `ForbiddenException('Origin not allowed')` (not `SPAM`).
    - `'rejects a recaptcha hostname outside the list'` — Google returns `{ success: true, hostname: 'evil.at' }`, list `['kunde.at']` → `ForbiddenException('Captcha hostname mismatch')`; empty list → passes.
    - `'rejects a mismatched action'` — config `expectedAction: 'contact'`, response `action: 'login'` → `ForbiddenException('Captcha action mismatch')`.
- [ ] **Step 3: Run** `pnpm --filter backend exec vitest run src/modules/inbound-form` — Expected: FAIL.
- [ ] **Step 4: Implement** the helpers, the origin check at the top of `checkSubmission`, `hostname`/`action` on `RecaptchaVerification` and their checks in `verifyRecaptcha`. In `submitForm`, add a `ip: string` parameter after `query` and pass `allowedHostnames: form.allowedHostnames, ip` in the context; `PublicInboundFormController` passes `request.ip ?? ''`.
- [ ] **Step 5: Run tests** — Expected: PASS. Add e2e cases to `test/inbound-form.e2e-spec.ts`: with `allowedHostnames: ['kunde.at']`, a submit with `Origin: https://kunde.at` → 201/200 as today, `Origin: https://evil.at` → 403, no Origin/Referer → 403. Run `pnpm --filter backend test:e2e -- inbound-form`.
- [ ] **Step 6: Commit** — skipped.

---

### Task 4: Token service (sign, verify, consume)

**Files:**

- Create: `apps/backend/src/modules/inbound-form/services/inbound-form-token.service.ts`
- Test: `apps/backend/src/modules/inbound-form/services/inbound-form-token.service.spec.ts`
- Modify: `apps/backend/src/modules/throttler-storage/throttler-storage.module.ts` (export `THROTTLER_REDIS_CLIENT`)
- Modify: `apps/backend/src/modules/inbound-form/inbound-form.module.ts` (import `ThrottlerStorageModule`, provide the service)

**Interfaces:**

- Produces:
    - `interface IssuedFormToken { token: string; notBefore: Date; expiresAt: Date; waitMs: number }` — `waitMs` (my addition) lets the client wait relative to the response instead of trusting its own clock against `notBefore`.
    - `interface VerifiedFormToken { nonce: string; maxAgeSeconds: number }`
    - `InboundFormTokenService.issue(inboundFormId: number, ip: string, config: InboundFormTimedTokenConfig): IssuedFormToken`
    - `InboundFormTokenService.verify(token: unknown, inboundFormId: number, ip: string, config: InboundFormTimedTokenConfig): VerifiedFormToken` — throws `ForbiddenException` with `'Missing form token'`, `'Invalid form token'` (format, signature, form, IP), `'Form token not yet valid'`, `'Form token expired'`.
    - `InboundFormTokenService.consume(verified: VerifiedFormToken): Promise<void>` — `SET inbound-form-token:<nonce> 1 EX <maxAgeSeconds> NX`; `null` reply → `ForbiddenException('Form token already used')`; any Redis error → `ForbiddenException('Form token could not be verified')`.
    - Constructor: `(configService: ConfigService<Env, true>, @Inject(THROTTLER_REDIS_CLIENT) redis: Pick<Redis, 'set'>, clock: { now(): number })`. Provide the clock as a provider token `FORM_TOKEN_CLOCK` defaulting to `{ now: () => Date.now() }` so tests inject time.

- [ ] **Step 1: Write failing tests** (fake clock, `vi.fn<Redis['set']>()`):
    - `'round-trips a token after the minimum delay'` — issue at t0, verify at t0+3s → `{ nonce, maxAgeSeconds: 3600 }`; `waitMs` = 3000.
    - `'rejects before the delay'` at t0+2.9s → `'Form token not yet valid'`.
    - `'rejects after max age'` at t0+3601s → `'Form token expired'`.
    - `'rejects another form'`, `'rejects another ip'`, `'rejects a tampered payload'`, `'rejects a missing token'` (`undefined`, `''`, `42`).
    - `'consumes a nonce once'` — `set` resolves `'OK'` then `null` → second call throws `'Form token already used'`; asserts `set` called with `('inbound-form-token:<nonce>', '1', 'EX', 3600, 'NX')`.
    - `'fails closed when redis errors'` — `set` rejects → `'Form token could not be verified'`.
- [ ] **Step 2: Run** `pnpm --filter backend exec vitest run src/modules/inbound-form/services/inbound-form-token.service.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**. Key: `hkdfSync('sha256', BACKEND_ENCRYPTION_SECRET, '', 'inbound-form-token', 32)` computed once. Payload `{ f, n, iat, ip }` with `n = randomBytes(16).toString('base64url')`, `iat` in epoch seconds, `ip = sha256(ip)` base64url; token `base64url(JSON) + '.' + base64url(hmacSha256(key, payloadPart))`; compare signatures with `timingSafeEqual` after a length check.
- [ ] **Step 4: Run tests** — Expected: PASS. Typecheck + lint backend.
- [ ] **Step 5: Commit** — skipped.

---

### Task 5: Token endpoint, submit integration, client script

**Files:**

- Create: `apps/backend/src/modules/inbound-form/client/inbound-form-client.ts`
- Test: `apps/backend/src/modules/inbound-form/client/inbound-form-client.spec.ts`
- Create: `apps/backend/src/modules/inbound-form/dtos/inbound-form-token.dto.ts`
- Modify: `controller/public-inbound-form.controller.ts`, `services/inbound-form-security.service.ts`, `services/inbound-form-submission.service.ts`
- Test: `controller/public-inbound-form.controller.spec.ts`, `services/inbound-form-security.service.spec.ts`, `services/inbound-form-submission.service.spec.ts`, `test/inbound-form.e2e-spec.ts`

**Interfaces:**

- Consumes: `InboundFormTokenService` (Task 4), `isOriginAllowed` (Task 3), `isTimedTokenConfig` (Task 2).
- Produces:
    - `checkSubmission(...)` returns `Promise<SecurityCheckOutcome>` where `type SecurityCheckOutcome = { result: SecurityCheckResult.SPAM } | { result: SecurityCheckResult.PASSED; token: VerifiedFormToken | null }`. Order: origin → honeypot → timed token `verify` → reCAPTCHA.
    - `InboundFormSubmissionService.issueToken(slug: string, headers: Record<string, unknown>, ip: string): Promise<IssuedFormToken>` — 404 `'Unknown form'` if inactive/unknown or no timed-token scheme; 403 `'Origin not allowed'`.
    - `POST /api/public/form/:slug/token` → `InboundFormTokenDto { token: string; notBefore: string; expiresAt: string; waitMs: number }` (ISO strings, explicit `@ApiProperty` each).
    - `GET /api/public/form/client.js` → `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: public, max-age=86400`; body `(${installInboundFormClient.toString()})(window, document.currentScript && document.currentScript.src)`. Declare this route **before** `:slug` routes so `client.js` is not read as a slug.
    - `installInboundFormClient(target: { InboundForm?: unknown; fetch: typeof fetch; setTimeout: typeof setTimeout }, scriptSrc: string | null | undefined): void` — must be fully self-contained (no imports, no outer references) because it is serialized with `toString()`; defines `target.InboundForm = { getToken(slug: string): Promise<string> }`. API base = `scriptSrc` with the trailing `/client.js` removed.

- [ ] **Step 1: Write failing client tests** (plain objects as `target`, `vi.fn<typeof fetch>()`, fake timers):
    - `'fetches lazily and waits the remaining delay'` — no fetch until `getToken('kontakt')`; fetch `POST <base>/kontakt/token`; response `{ token: 't1', waitMs: 3000 }`; promise unresolved at 2999 ms, resolves `'t1'` at 3000 ms.
    - `'hands each token out once'` — two sequential `getToken` calls → two fetches, tokens `t1`, `t2`.
    - `'reuses an in-flight token request'` — prefetch via first call, second call before hand-out does not fetch twice (my call: one pending request per slug).
    - `'rejects with the status'` — 429 → rejects with an `Error` whose `status` is 429.
    - `'survives toString serialization'` — `new Function('target', 'src', \`(${installInboundFormClient.toString()})(target, src)\`)` then the first test's flow passes.
- [ ] **Step 2: Write failing service tests:**
    - security: `'verifies the timed token from its location'` (body/header/query) → outcome carries `token`; `'skips recaptcha when the token is invalid'`.
    - submission: `'consumes the token after field validation'` — invalid data → `BadRequestException` and `consume` not called; valid data → `consume` called before `submissionModel.create`.
    - submission: `'keeps a token usable after a captcha failure'` — reCAPTCHA throws → `consume` not called.
    - submission: `issueToken` — unknown slug 404, no scheme 404, foreign origin 403, happy path calls `tokenService.issue(formId, ip, config)`.
    - controller: `'serves the client script'` — headers as above, body contains `installInboundFormClient` source and `document.currentScript`.
- [ ] **Step 3: Run** `pnpm --filter backend exec vitest run src/modules/inbound-form` — Expected: FAIL.
- [ ] **Step 4: Implement** client function, DTO, controller routes, `checkSubmission` outcome, `issueToken`, and in `submitForm` call `tokenService.consume(outcome.token)` after `buildDataSchema` succeeds and before the transaction.
- [ ] **Step 5: Run tests** — Expected: PASS. Add e2e cases: form with hostnames + timed token; `POST /token` with Origin → token; submit immediately → 403 `not yet valid`; after `minDelaySeconds: 1` wait → accepted; same token again → 403 `already used`; invalid data with a fresh token → 400, then valid data with the same token → accepted; `GET /api/public/form/client.js` → 200 JS. Run `pnpm --filter backend test:e2e -- inbound-form`.
- [ ] **Step 6: Regenerate API** — `pnpm --filter backend generate && pnpm --filter api build`.
- [ ] **Step 7: Commit** — skipped.

---

### Task 6: Rate limits per IP and form

**Files:**

- Create: `apps/backend/src/modules/inbound-form/helpers/form-throttle.ts`
- Test: `apps/backend/src/modules/inbound-form/helpers/form-throttle.spec.ts`
- Modify: `apps/backend/src/config/env.schema.ts`, `.env.example`, `apps/backend/src/app.module.ts`, `controller/public-inbound-form.controller.ts`
- Test: `apps/backend/test/rate-limit.e2e-spec.ts`

**Interfaces:**

- Produces: `FORM_SUBMIT_THROTTLER = 'formSubmit'`, `FORM_TOKEN_THROTTLER = 'formToken'`; decorator `FormThrottle(kind: 'submit' | 'token')` setting metadata `FORM_THROTTLE_KEY`; `formThrottleKind(context: ExecutionContext): 'submit' | 'token' | null`; `formThrottleTracker(request: { ip?: string; params?: Record<string, string> }): string` → `` `form:${slug}:${ip}` ``.
- Env: `FORM_SUBMIT_RATE_LIMIT` (default 5), `FORM_SUBMIT_RATE_TTL` (default 600000), `FORM_TOKEN_RATE_LIMIT` (default 5), `FORM_TOKEN_RATE_TTL` (default 600000).

- [ ] **Step 1: Write failing helper tests** — tracker `{ ip: '1.2.3.4', params: { slug: 'kontakt' } }` → `form:kontakt:1.2.3.4`; `formThrottleKind` reads metadata from handler (`'submit'`, `'token'`, `null` for undecorated).
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3: Implement** helpers, env keys (with `.env.example` lines), two throttlers in `app.module.ts` with `getTracker: formThrottleTracker` and `skipIf: (context) => formThrottleKind(context) !== '<kind>'`, and `@FormThrottle('submit')` / `@FormThrottle('token')` on the controller methods (not on `client.js`).
- [ ] **Step 4: Run unit tests** — PASS. **Step 5: Add e2e** in `rate-limit.e2e-spec.ts` (use `throttle-reset.ts` support): 6th token request for the same slug/IP within the window → 429, a different slug still 200; 6th submit → 429. Run `pnpm --filter backend test:e2e -- rate-limit`.
- [ ] **Step 6: Commit** — skipped.

---

### Task 7: Frontend — allowed domains in the Security card

**Files:**

- Create: `apps/frontend/src/modules/inbound-forms/views/details/partials/AllowedHostnamesDialog.vue`
- Modify: `apps/frontend/src/modules/inbound-forms/views/details/partials/SecurityCard.vue`
- Modify: `apps/frontend/src/locales/en.json`
- Test: `apps/frontend/src/modules/inbound-forms/views/details/__tests__/FormDialogs.spec.ts`, `__tests__/InboundFormDetailView.spec.ts`, `src/__tests__/fixtures.ts`

**Interfaces:**

- Consumes: `useInboundFormUpdateMutation` with `update: { allowedHostnames: string[] }`.
- Produces: `AllowedHostnamesDialog` props `{ hostnames: string[]; saving: boolean; error?: string | null }`, `v-model` open state, emits `save: [hostnames: string[]]`.

- [ ] **Step 1: Write failing tests:**
    - detail view: form with `allowedHostnames: []` shows `module.inboundForms.details.security.hostnames.emptyWarning`; with `['kunde.at']` shows the chip `kunde.at` and no warning.
    - dialog: entering `Kunde.at` and `kunde.at` emits `save` with `['kunde.at']`; `https://kunde.at` shows `validation.hostname` and does not emit.
- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/modules/inbound-forms` — Expected: FAIL.
- [ ] **Step 3: Implement**: block above the scheme list in `SecurityCard` (chips via `TagLabel`, `InlineAlert` warning when empty, edit `IconButton` when `canUpdate`); dialog with `FormDialog` + `VCombobox multiple chips`, Zod item check mirroring the backend regex; `validation.hostname` and `module.inboundForms.details.security.hostnames.*` keys.
- [ ] **Step 4: Run tests** — PASS; `pnpm --filter frontend lint && pnpm --filter frontend typecheck`.
- [ ] **Step 5: Commit** — skipped.

---

### Task 8: Frontend — Security dialog for the new rules

**Files:**

- Modify: `apps/frontend/src/modules/inbound-forms/views/details/partials/SecurityDialog.vue`, `SecurityCard.vue` (`toUpsert`, subtitle), `src/locales/en.json` (drop `typeOptions.csrf`, add `typeOptions.timed-token`, field labels/hints)
- Test: `views/details/__tests__/FormDialogs.spec.ts`, `mutations/__tests__/useInboundFormSecurityMutation.spec.ts`

**Interfaces:**

- Consumes: `InboundFormSecurityConfigUpsertDto` / `InboundFormSecurityConfigDto` (Task 2); SecurityDialog gains prop `hasHostnames: boolean`.

- [ ] **Step 1: Write failing dialog tests:**
    - `'hides the location for honeypots and saves body'` — type honeypot → no `location` select; emitted payload `location: 'body'`.
    - `'saves the expected action for recaptcha'` → `config: { secret, minScore, expectedAction: 'contact' }`.
    - `'saves timed-token settings with defaults'` — defaults shown 3 / 3600, key default `formToken`; payload `config: { minDelaySeconds: 3, maxAgeSeconds: 3600 }`; out-of-range (0, 61 / 59, 86401) shows validation errors.
    - `'disables the timed token without allowed domains'` — `hasHostnames: false` → option disabled with hint `module.inboundForms.details.security.dialog.timedTokenNeedsHostnames`.
    - SecurityCard `toUpsert` keeps `expectedAction`, `minDelaySeconds`, `maxAgeSeconds` of untouched schemes when saving another.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (type union `'google-recaptcha' | 'honeypot' | 'timed-token'`, Zod schema per type, `defaultType` covering all three). **Step 4: Run** — PASS; lint + typecheck frontend.
- [ ] **Step 5: Commit** — skipped.

---

### Task 9: Frontend — fetch example and integration info dialogs

**Files:**

- Create: `apps/frontend/src/modules/inbound-forms/helpers/integrationSnippets.ts`
- Test: `apps/frontend/src/modules/inbound-forms/helpers/__tests__/integrationSnippets.spec.ts`
- Create: `apps/frontend/src/modules/inbound-forms/views/details/partials/SecurityInfoDialog.vue`
- Modify: `EndpointCard.vue`, `SecurityCard.vue`, `helpers/formEndpointUrl.ts`, `src/locales/en.json`
- Delete: `apps/frontend/src/modules/inbound-forms/helpers/exampleForm.ts`
- Test: `views/details/__tests__/InboundFormDetailView.spec.ts`

**Interfaces:**

- Consumes: `buildSampleData(fields)` (existing `helpers/sampleData.ts`).
- Produces:
    - `formClientScriptUrl(): string` → `` `${location.origin}/api/public/form/client.js` `` (in `formEndpointUrl.ts`).
    - `exampleRequest(endpoint: string, fields: InboundFormFieldDto[]): string` — `await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: <sample> }) })`, sample pretty-printed with 4-space indent, no `security`.
    - `honeypotSnippet(endpoint: string, scheme: Pick<InboundFormSecurityDto, 'key'>): string` — HTML form with `<input name="<key>" tabindex="-1" autocomplete="off" class="hp-field">` + CSS hiding `.hp-field` off-screen, and a fetch body with `security: { <key>: form.elements.<key>.value }`.
    - `recaptchaSnippet(endpoint: string, scheme: Pick<InboundFormSecurityDto, 'location' | 'key' | 'config'>): string` — `<script src="https://www.google.com/recaptcha/api.js?render=SITE_KEY">`, `grecaptcha.execute('SITE_KEY', { action: '<expectedAction or submit>' })`, token placed per location.
    - `timedTokenSnippet(endpoint: string, scriptUrl: string, slug: string, scheme: Pick<InboundFormSecurityDto, 'location' | 'key'>): string` — script include + submit handler with `await InboundForm.getToken('<slug>')`, token placed per location, retry once with a fresh token on 403.
    - Token placement shared helper: body → `security: { <key>: token }`, header → `headers: { '<key>': token }`, query → `` `${endpoint}?<key>=${encodeURIComponent(token)}` ``.
    - `SecurityInfoDialog` props `{ scheme: InboundFormSecurityDto | null; form: InboundFormDetailDto }`, `v-model`; shows explanation text (`module.inboundForms.details.security.info.<type>.*`) and the snippet in a `CopyField`.

- [ ] **Step 1: Write failing snippet tests** — `exampleRequest` contains `"Content-Type": "application/json"` and the `buildSampleData` JSON, no `security`; honeypot contains `name="website"` and `tabindex="-1"` and not `type="hidden"`; recaptcha with `expectedAction: 'contact'` contains `{ action: 'contact' }`, header location contains `'x-captcha': token`; timed token query location contains `?formToken=` and `InboundForm.getToken('kontakt')` and the script URL.
- [ ] **Step 2: Write failing view test** — clicking the info button of a honeypot row opens the dialog showing the honeypot snippet; endpoint card example contains `fetch(` and no `<form`.
- [ ] **Step 3: Run** `pnpm --filter frontend exec vitest run src/modules/inbound-forms` — FAIL.
- [ ] **Step 4: Implement** helpers, dialog, info `IconButton` (`mdiInformationOutline`) per row (visible to read-only users too), `EndpointCard` switched to `exampleRequest`; remove `exampleForm.ts` and its now-unused `endpoint.send` i18n key.
- [ ] **Step 5: Run tests** — PASS; lint (oxlint + eslint) + typecheck frontend.
- [ ] **Step 6: Commit** — skipped.

---

### Task 10: Full gate

- [ ] **Step 1:** `pnpm --filter backend generate && pnpm --filter api build` — Expected: no diff surprises in `packages/api/assets/openapi.json` beyond the new fields/endpoints.
- [ ] **Step 2:** `pnpm check` — Expected: lint, typecheck, test, format all pass.
- [ ] **Step 3:** `pnpm --filter backend test:e2e` — Expected: PASS (Docker required).
- [ ] **Step 4:** Manual smoke via the `run` skill: create a form with `allowedHostnames: ['localhost']`, add a timed token, load a local HTML page that includes `client.js` and submits via the timed-token snippet; confirm accept, too-early rejection, and reuse rejection.
- [ ] **Step 5: Commit** — skipped.
