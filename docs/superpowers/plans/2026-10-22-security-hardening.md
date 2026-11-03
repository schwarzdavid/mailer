# Security Hardening (Go-Live Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Phase 2 security blockers from the go-live audit before the first production deploy.

**Architecture:** Most changes are backend-only. The backend gets helmet, CORS for its own `SITE_ADDRESS` (public form routes stay open to every origin), minimum secret lengths, an OpenAPI document without hard-coded servers, a throttler guard that fails closed for login and setup when Redis is down, and a random setup token written to the log while no user exists. The frontend gets a setup-token field in onboarding and more visible warnings for forms without allowed domains. The smoke test checks that `?key=` never reaches a container log.

**Tech Stack:** NestJS 12 (Express), `helmet` 8, `cors` (via `app.enableCors`), `@nestjs/throttler` 6.7, Zod env schema, Vue 3 + Vuetify + vee-validate, Vitest, supertest, Playwright, Docker Compose smoke test.

**Spec:** The Phase 2 list from the go-live audit (items 10–17, memory `go-live-readiness-status`), with the owner's rulings from 2026-10-22:

| #   | Audit item                                                           | Ruling                                                                                                                                        |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | helmet + restrict CORS to own origin                                 | Use the existing `SITE_ADDRESS` env var as the own origin                                                                                     |
| 11  | Swagger off in production, drop localhost server                     | `/docs` is already off in production; remove the servers                                                                                      |
| 12  | Min. 32 chars for `BACKEND_JWT_SECRET` / `BACKEND_ENCRYPTION_SECRET` | As stated                                                                                                                                     |
| 13  | Spam relay via placeholder recipients                                | **Out of scope**: intentional                                                                                                                 |
| 14  | Empty `allowedHostnames` allows every origin                         | **Warning in the UI only**, behaviour unchanged                                                                                               |
| 15  | First visitor becomes super-admin                                    | Random setup token written to the backend log on startup while no user exists; no env var. A setup CLI follows later (`TODO.md`, "Setup CLI") |
| 16  | Rate limits fail open on Redis outage                                | Login **and** `POST /setup/user` fail closed (503); everything else stays fail-open                                                           |
| 17  | `?key=` lands in proxy/access logs                                   | **Keep `?key=`**; make sure our own logs never contain it                                                                                     |

## Global Constraints

- **Never touch git** (CLAUDE.md). The "commit" step of every task is replaced by: leave the changes in the working tree and report the files touched.
- **No code comments** (CLAUDE.md). Config files (JSON, YAML, Caddyfile) stay comment-free too (memory `no-comments-in-config-files`).
- **Pinned dependency:** `helmet@^8.1.0`, added to `apps/backend` only.
- **Minimum secret length:** exactly 32 characters for `BACKEND_JWT_SECRET` and `BACKEND_ENCRYPTION_SECRET`, in every `NODE_ENV`.
- **Test doubles:** typed per CLAUDE.md "Type-safe test doubles": `vi.fn<Collaborator['method']>()`, no `as` casts.
- **Frontend copy:** i18n only in `src/locales/en.json`. Shared keys sit at the root (`status.*`, `field.*`); feature copy sits under `module.*` (memory `frontend-i18n-conventions`).
- **Formatting:** after editing, `pnpm format:fix`; no hand-formatting.
- **Each task's gate:** `pnpm --filter <pkg> typecheck`, `pnpm --filter <pkg> lint` and that package's touched specs. The last task runs the full gate.

## Review Focus

1. **A customer website embeds a form from another origin.** It loads `/api/public/form/client.js` with `<script src>`, which helmet's default `Cross-Origin-Resource-Policy: same-origin` would block. It also sends a `fetch` POST with a custom security-check header, which needs a CORS preflight that answers with `*` and echoes the requested headers. _Pinned in Task 3's e2e._
2. **The production SPA under CSP.** The template editor compiles Handlebars in the browser (`new Function`, so it needs `'unsafe-eval'`), runs Monaco workers (`/assets/*.worker-*.js`), and renders the preview in a `sandbox=""` srcdoc iframe that inherits the page's CSP, so email images over `https:` need `img-src https:`. Playwright serves the SPA with `vite preview`, so no automated suite sees this CSP. _Pinned by Task 3's manual production-mode browser check._
3. **Redis down.** Login and first-user registration must answer 503 and never 2xx. Inbound forms and the send API keep working. A real 429 must still reach the client as 429, not as 503 and not swallowed. _Pinned in Task 4's guard spec and e2e._
4. **A stale setup token.** Every backend restart (including each `pnpm dev` rebuild) generates a new token. A token from the previous run gets 403 and creates no user, and the UI shows the server message. _Pinned in Task 5's e2e._
5. **`SITE_ADDRESS` in the forms Caddy accepts:** bare host, `https://host`, `host:8443`, port-only `:80` (smoke test), a comma-separated list, empty or unset (dev). Each maps to the right origin list and never crashes boot. _Pinned in Task 3's env spec._

---

### Task 1: Minimum secret length (#12)

**Files:**

- Modify: `apps/backend/src/config/env.schema.ts` (`BACKEND_JWT_SECRET`, `BACKEND_ENCRYPTION_SECRET`)
- Modify: `apps/backend/src/config/env.schema.spec.ts`
- Modify (fixtures that reach `envSchema.parse`): `apps/backend/src/factories/app.setup.spec.ts`, `apps/backend/src/factories/sequelize-options.spec.ts`, `apps/backend/src/factories/static-frontend.spec.ts`, `apps/backend/src/modules/mail/mail.module.spec.ts`
- Modify: `apps/backend/src/openapi/spec-env.ts` (placeholders are 24 chars, so spec generation would break)
- Modify: `apps/backend/test/support/infrastructure.ts:83-84`, `apps/frontend/e2e/support/infrastructure.ts:74-75`
- Modify: `.env.example`, `README.md` (deploy step 2)

**Interfaces:**

- Produces: `envSchema` and `migrationEnvSchema` reject secrets shorter than 32 characters with the message `Must be at least 32 characters; generate one with: openssl rand -base64 48`.

- [ ] **Step 1: Write the failing tests** in `env.schema.spec.ts`

```ts
const shortSecret = 'x'.repeat(31)
const minimalSecret = 'x'.repeat(32)

it.each(['BACKEND_JWT_SECRET', 'BACKEND_ENCRYPTION_SECRET'])('rejects a %s shorter than 32 characters', (key) => {
    const result = envSchema.safeParse({ ...requiredEnv, [key]: shortSecret })
    expect(result.success).toBe(false)
    expect(result.error?.issues).toContainEqual(
        expect.objectContaining({
            path: [key],
            message: 'Must be at least 32 characters; generate one with: openssl rand -base64 48',
        }),
    )
})

it.each(['BACKEND_JWT_SECRET', 'BACKEND_ENCRYPTION_SECRET'])('accepts a %s of exactly 32 characters', (key) => {
    expect(envSchema.safeParse({ ...requiredEnv, [key]: minimalSecret }).success).toBe(true)
})

it('rejects a short BACKEND_ENCRYPTION_SECRET in the migration schema', () => {
    expect(migrationEnvSchema.safeParse({ BACKEND_ENCRYPTION_SECRET: shortSecret }).success).toBe(false)
})
```

- [ ] **Step 2: Run** `pnpm --filter backend exec vitest run src/config/env.schema.spec.ts`. Expected: the new rejection tests FAIL.

- [ ] **Step 3: Implement.** In `env.schema.ts` add a `secret` schema (`z.string().min(32, { message: … })`) next to `port`, and use it for both keys. `migrationEnvSchema` inherits it through `envShape`.

- [ ] **Step 4: Update every fixture** to values of at least 32 characters:
    - spec files: `'jwt-secret'` → `'jwt-secret-for-unit-tests-0123456789'`, `'encryption-secret'` → `'encryption-secret-for-unit-tests-0123'`, migration-schema `'x'` → `'x'.repeat(32)`
    - `spec-env.ts`: `'openapi-spec-placeholder-0123456789'`
    - backend e2e: `'e2e-jwt-secret-0123456789abcdef'`, `'e2e-encryption-secret-0123456789ab'`
    - Playwright: `'playwright-jwt-secret-0123456789ab'`, `'playwright-encryption-secret-012345'`
    - `.env.example`: `dev-jwt-secret-change-me-0123456789` and `dev-encryption-secret-change-me-0123`
    - `README.md` deploy step 2: "Fill in the secrets (`BACKEND_JWT_SECRET` and `BACKEND_ENCRYPTION_SECRET` need at least 32 characters, e.g. `openssl rand -base64 48`)".

    Count each value's length; every one must be ≥ 32.

- [ ] **Step 5: Run** `pnpm --filter backend exec vitest run src/config src/factories src/modules/mail` and `pnpm --filter backend generate`. Expected: PASS, and `apps/backend/openapi.json` is written.

- [ ] **Step 6: The local dev `.env`.** Read the root `.env`. If its secrets are shorter than 32 characters, replace them with the `.env.example` values. Report to the user that a new `BACKEND_ENCRYPTION_SECRET` makes DKIM keys and reCAPTCHA secrets already stored in the dev database unreadable, so the dev Postgres volume should be reset (memory `inbound-form-worktree-setup`). Then run `pnpm --filter backend migrate pending`. Expected: it connects without an env validation error.

- [ ] **Step 7: No commit** (Global Constraints).

---

### Task 2: OpenAPI document without servers (#11)

**Files:**

- Modify: `apps/backend/src/factories/app.setup.ts:84-85` (`createOpenApiDocument`)
- Test: `apps/backend/test/openapi.e2e-spec.ts`

**Interfaces:**

- Produces: `createOpenApiDocument(app)` without `servers`. The generated client in `packages/api` loses its default `baseUrl`, and the frontend keeps setting `baseUrl: location.origin` (`apps/frontend/src/main.ts:65`).

- [ ] **Step 1: Write the failing test** in `openapi.e2e-spec.ts`

```ts
it('lists no servers, so every client resolves requests against its own origin', () => {
    expect(document.servers ?? []).toEqual([])
})
```

(`document` is whatever variable the suite already uses for the booted app's document.)

- [ ] **Step 2: Run** `pnpm --filter backend exec vitest run --config vitest.config.e2e.ts test/openapi.e2e-spec.ts`. Expected: FAIL with the two servers listed.

- [ ] **Step 3: Remove both `.addServer(...)` calls.** `/docs` is already off in production (`shouldServeApiDocs`, covered by `app.setup.spec.ts`), so nothing else changes for #11.

- [ ] **Step 4: Run** the same e2e file, then `pnpm build --filter api` and `pnpm --filter frontend typecheck`. Expected: PASS. Also run `grep -rn "localhost:8000\|schwarzdavid.email" packages/api/dist`. Expected: no match.

- [ ] **Step 5: No commit.**

---

### Task 3: helmet and CORS limited to `SITE_ADDRESS` (#10)

**Files:**

- Modify: `apps/backend/package.json` (`helmet@^8.1.0`)
- Modify: `apps/backend/src/config/env.schema.ts` (new key `SITE_ADDRESS`)
- Modify: `apps/backend/src/factories/app.setup.ts` (helmet options + CORS delegate; `configureApp`: replace `app.enableCors()`)
- Test: `apps/backend/src/factories/app.setup.spec.ts`
- Modify: `apps/backend/src/modules/inbound-form/controller/public-inbound-form.controller.ts` (`getInboundFormClient`)
- Modify: `apps/backend/test/support/infrastructure.ts` (e2e env gets `SITE_ADDRESS: 'app.e2e.test'`)
- Test: `apps/backend/src/config/env.schema.spec.ts`, `apps/backend/test/bootstrap.e2e-spec.ts`, `apps/backend/test/static-frontend.e2e-spec.ts`
- Modify: `README.md` (production section: the backend reads `SITE_ADDRESS` for CORS and sets the security headers; `/api/v1/send` is not callable from browsers)

**Interfaces:**

- Produces: `Env['SITE_ADDRESS']: string[]`, a list of origins such as `['https://app.example.com']`.
- Produces in `app.setup.ts`, next to `API_PREFIX` and `shouldServeApiDocs`:
    - `const PUBLIC_FORM_PATH_PREFIX = \`/${API_PREFIX}/public/form/\``
    - `export const helmetOptions: HelmetOptions`
    - `export function corsOptionsFor(path: string, siteOrigins: string[]): CorsOptions`
    - They deliberately stay in `app.setup.ts`. A separate file would need `API_PREFIX` from `app.setup.ts` while `app.setup.ts` imports it back, and that ESM cycle hits the TDZ at load time.

- [ ] **Step 1: Write the failing env tests** (`env.schema.spec.ts`, `describe('SITE_ADDRESS')`)

```ts
it.each([
    [undefined, []],
    ['', []],
    [':80', []],
    ['app.example.com', ['https://app.example.com']],
    ['https://app.example.com', ['https://app.example.com']],
    ['http://app.example.com', ['http://app.example.com']],
    ['app.example.com:8443', ['https://app.example.com:8443']],
    ['https://app.example.com:443', ['https://app.example.com']],
    ['app.example.com, www.example.com', ['https://app.example.com', 'https://www.example.com']],
])('maps SITE_ADDRESS %j to the origins %j', (value, origins) => {
    expect(envSchema.parse({ ...requiredEnv, SITE_ADDRESS: value }).SITE_ADDRESS).toEqual(origins)
})

it('rejects a wildcard SITE_ADDRESS', () => {
    expect(envSchema.safeParse({ ...requiredEnv, SITE_ADDRESS: '*.example.com' }).success).toBe(false)
})
```

- [ ] **Step 2: Write the failing CORS/helmet unit tests** in `app.setup.spec.ts`

```ts
it('allows every origin on public form routes without credentials', () => {
    expect(corsOptionsFor('/api/public/form/contact/token', ['https://app.example.com'])).toEqual(
        expect.objectContaining({ origin: '*', credentials: false }),
    )
})

it('allows only the site origins everywhere else', () => {
    expect(corsOptionsFor('/api/auth/login', ['https://app.example.com']).origin).toEqual(['https://app.example.com'])
    expect(corsOptionsFor('/api/v1/send', []).origin).toEqual([])
})

it('does not treat a path that merely starts like the public prefix as public', () => {
    expect(corsOptionsFor('/api/public/formular', []).origin).toEqual([])
})

it('lets the SPA compile Handlebars templates and preview remote images', () => {
    const directives = helmetOptions.contentSecurityPolicy
    expect(directives).toMatchObject({
        directives: { scriptSrc: ["'self'", "'unsafe-eval'"], imgSrc: ["'self'", 'data:', 'https:'] },
    })
})
```

- [ ] **Step 3: Run** `pnpm --filter backend exec vitest run src/config/env.schema.spec.ts src/factories/app.setup.spec.ts`. Expected: FAIL (`SITE_ADDRESS`, `helmetOptions` and `corsOptionsFor` missing).

- [ ] **Step 4: Implement.**
    - **Env:** `SITE_ADDRESS` is optional and transforms to `string[]`. Split on `/[\s,]+/` and drop empty entries and entries starting with `:`. Entries containing `://` → `new URL(entry).origin`; all others → `new URL(\`https://${entry}\`).origin`. An entry containing `*`, or one `URL`cannot parse, adds a`custom`issue`Unsupported SITE_ADDRESS entry "<entry>"`.
    - **`app.setup.ts`:**
        - `helmetOptions` keeps helmet's defaults and overrides only `contentSecurityPolicy.directives.scriptSrc` and `imgSrc` with the values from the test.
        - `corsOptionsFor` returns `{ origin: '*', credentials: false }` for paths starting with `PUBLIC_FORM_PATH_PREFIX`, else `{ origin: siteOrigins, credentials: false }`. Don't pin `allowedHeaders`: `cors` then echoes `Access-Control-Request-Headers`, which header-located security checks need.
    - **`configureApp`:** `app.use(helmet(helmetOptions))` as the first middleware, before `applyPublicSendJsonLimit`. Then `app.enableCors((request, callback) => callback(null, corsOptionsFor(request.path, siteOrigins)))`, with `siteOrigins` read from `ConfigService` like `applyTrustProxy` reads its value.
    - **`getInboundFormClient`:** add `@Header('Cross-Origin-Resource-Policy', 'cross-origin')`.

- [ ] **Step 5: Write the failing e2e tests.** In `bootstrap.e2e-spec.ts`, replace `'answers cross-origin requests with CORS headers'` with:

```ts
it('answers the site origin with CORS headers', async () => {
    await request(app.getHttpServer())
        .get('/api/setup/status')
        .set('Origin', 'https://app.e2e.test')
        .expect('Access-Control-Allow-Origin', 'https://app.e2e.test')
        .expect(200)
})

it('gives foreign origins no CORS headers on the admin API', async () => {
    const response = await request(app.getHttpServer()).get('/api/setup/status').set('Origin', 'https://evil.example')
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
})

it('answers a public form preflight from any origin and echoes the requested headers', async () => {
    const response = await request(app.getHttpServer())
        .options('/api/public/form/contact')
        .set('Origin', 'https://kunde.example')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-form-check')
        .expect(204)
    expect(response.headers['access-control-allow-origin']).toBe('*')
    expect(response.headers['access-control-allow-headers']).toBe('content-type,x-form-check')
})

it('lets other sites load the form client script', async () => {
    await request(app.getHttpServer())
        .get('/api/public/form/client.js')
        .expect('Cross-Origin-Resource-Policy', 'cross-origin')
        .expect(200)
})

it('sends the helmet security headers', async () => {
    const response = await request(app.getHttpServer()).get('/api/setup/status').expect(200)
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['strict-transport-security']).toContain('max-age=')
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin')
    expect(response.headers['content-security-policy']).toContain("script-src 'self' 'unsafe-eval'")
})
```

In `static-frontend.e2e-spec.ts`, extend `'serves index.html at the root without caching it'` with `expect(response.headers['content-security-policy']).toContain("default-src 'self'")`.

- [ ] **Step 6: Run** `pnpm --filter backend exec vitest run --config vitest.config.e2e.ts test/bootstrap.e2e-spec.ts test/static-frontend.e2e-spec.ts test/inbound-form.e2e-spec.ts test/rate-limit.e2e-spec.ts`. Expected: PASS. The last two prove that public form routes still work behind helmet and the new CORS.

- [ ] **Step 7: Manual production-mode browser check** (Review Focus 2).
    1. Build the frontend into `apps/backend/public`.
    2. Start the backend with `NODE_ENV=production` against the dev stack (`dev/docker-compose.yml`).
    3. Drive it with the Playwright or Chrome DevTools MCP: log in, open an inbound form's template editor, type in Monaco, put `<img src="https://placehold.co/10">` into the template and watch the preview render.
    4. Check `list_console_messages` / `browser_console_messages`. Expected: no `Content-Security-Policy` violations.
    5. Then start in development mode and open `http://localhost:8000/docs`. Expected: Swagger UI renders. If it doesn't, the decided fix is to skip helmet's CSP for paths under `/docs` (only mounted outside production); do not loosen the global CSP.
    6. Delete `apps/backend/public` afterwards if it didn't exist before.

- [ ] **Step 8: No commit.**

---

### Task 4: Login and setup fail closed when Redis is down (#16)

**Files:**

- Rename: `apps/backend/src/modules/throttler-storage/services/fail-open-throttler-storage.service.ts` → `throttler-storage.service.ts`, class `FailOpenThrottlerStorage` → `ThrottlerStorageService` (spec likewise)
- Create: `apps/backend/src/modules/throttler-storage/exceptions/throttler-storage-unavailable.error.ts`
- Create: `apps/backend/src/modules/throttler-storage/guards/app-throttler.guard.ts` + `app-throttler.guard.spec.ts`
- Create: `apps/backend/src/modules/throttler-storage/decorators/FailClosedThrottle.ts`
- Modify: `apps/backend/src/modules/throttler-storage/throttler-storage.constants.ts`, `throttler-storage.module.ts`
- Modify: `apps/backend/src/app.module.ts:38,82-83`
- Modify (`ThrottlerGuard` → `AppThrottlerGuard`): `auth/controller/auth.controller.ts`, `setup/controller/setup.controller.ts`, `inbound-form/controller/public-inbound-form.controller.ts`, `api-key/decorators/ApiKeyAuth.ts` (+ `ApiKeyAuth.spec.ts`)
- Test: `apps/backend/test/rate-limit.e2e-spec.ts`

**Interfaces:**

- Produces:
    - `class ThrottlerStorageUnavailableError extends Error`, whose message is `Redis throttler storage unavailable: <cause message>`.
    - `ThrottlerStorageService implements ThrottlerStorage, OnApplicationShutdown`. Its `increment` delegates to `ThrottlerStorageRedisService` and wraps every rejection in `ThrottlerStorageUnavailableError`; it neither logs nor swallows.
    - `THROTTLE_FAIL_CLOSED_KEY = 'throttle:fail-closed'` in the constants.
    - `FailClosedThrottle = () => SetMetadata(THROTTLE_FAIL_CLOSED_KEY, true)`.
    - `@Injectable() class AppThrottlerGuard extends ThrottlerGuard`, which overrides `protected handleRequest(requestProps: ThrottlerRequest): Promise<boolean>`.
- Consumes: `ThrottlerRequest.context` (from `@nestjs/throttler`) and the inherited `this.reflector`.

- [ ] **Step 1: Write the failing guard spec** (`app-throttler.guard.spec.ts`). Build the guard with a storage stub (`vi.fn<ThrottlerStorage['increment']>()`) and a real `Reflector`, and call `canActivate` on an `ExecutionContext` whose handler either is or isn't decorated with `@FailClosedThrottle()`:

```ts
it('lets the request through and warns when the storage is unavailable on a fail-open route', async () => {
    increment.mockRejectedValue(new ThrottlerStorageUnavailableError(new Error('Connection is closed.')))
    await expect(guard.canActivate(contextFor(OpenController, 'handle'))).resolves.toBe(true)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Rate limit not enforced'))
})

it('answers 503 when the storage is unavailable on a fail-closed route', async () => {
    increment.mockRejectedValue(new ThrottlerStorageUnavailableError(new Error('Connection is closed.')))
    await expect(guard.canActivate(contextFor(ClosedController, 'handle'))).rejects.toBeInstanceOf(
        ServiceUnavailableException,
    )
})

it('still answers 429 on a fail-open route when the limit is exceeded', async () => {
    increment.mockResolvedValue({ totalHits: 11, timeToExpire: 60, isBlocked: true, timeToBlockExpire: 60 })
    await expect(guard.canActivate(contextFor(OpenController, 'handle'))).rejects.toBeInstanceOf(ThrottlerException)
})
```

Update `throttler-storage.service.spec.ts`: the two "fails open" cases become `'rejects with ThrottlerStorageUnavailableError when Redis rejects the command'` and `'… when the storage rejects an unexpected reply'`. The shutdown cases stay.

- [ ] **Step 2: Run** `pnpm --filter backend exec vitest run src/modules/throttler-storage`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement.** In `handleRequest`, `try { return await super.handleRequest(requestProps) }`. Catch only `ThrottlerStorageUnavailableError`, and rethrow anything else (that includes `ThrottlerException`).
    - When `this.reflector.getAllAndOverride<boolean>(THROTTLE_FAIL_CLOSED_KEY, [handler, class])` is true: throw `new ServiceUnavailableException('Rate limiting is temporarily unavailable')`.
    - Otherwise: log `Rate limit not enforced, ${error.message}` at `warn` (a private `Logger(AppThrottlerGuard.name)`) and return `true`.
    - Swap the guard in all four call sites and the storage class in `app.module.ts` and the module's `providers`/`exports`.
    - Add `@FailClosedThrottle()` to `AuthController.login` and `SetupController.registerUser`.
    - Update the comment in `throttler-storage.module.ts` (`enableOfflineQueue`) to say "fails fast" instead of "fails open". It is the existing _why_ comment, so keep it.

- [ ] **Step 4: Write the failing e2e** in `rate-limit.e2e-spec.ts`. Use a dedicated `describe('when Redis is unavailable')` with its own `createTestApp()`, whose `beforeAll` calls `app.get<Redis>(THROTTLER_REDIS_CLIENT).disconnect()`:

```ts
it('refuses logins with 503 instead of skipping the limit', async () => {
    await http()
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever-password' })
        .expect(503)
})

it('refuses first-user registration with 503', async () => {
    await http().post('/api/setup/user').send(validRegistration).expect(503)
})

it('keeps public form routes available', async () => {
    const response = await http().post('/api/public/form/unknown-slug').send({ data: {} })
    expect(response.status).toBe(404)
})
```

`validRegistration` must pass validation and carry a `setupToken` once Task 5 lands. Before then the request gets the 503 from the guard, which runs before the pipe. Close this app in `afterAll`.

- [ ] **Step 5: Run** `pnpm --filter backend exec vitest run src/modules/throttler-storage src/modules/api-key/decorators`, then `pnpm --filter backend exec vitest run --config vitest.config.e2e.ts test/rate-limit.e2e-spec.ts test/auth.e2e-spec.ts test/public-send.e2e-spec.ts`. Expected: PASS.

- [ ] **Step 6: No commit.**

---

### Task 5: Setup token in the log, backend (#15)

**Files:**

- Create: `apps/backend/src/modules/setup/services/setup-token.service.ts` + `.spec.ts`
- Modify: `apps/backend/src/modules/setup/setup.module.ts` (provide it)
- Modify: `apps/backend/src/modules/setup/dtos/register-user.dto.ts` (+ `.spec.ts`)
- Modify: `apps/backend/src/modules/setup/services/setup.service.ts` (+ `.spec.ts`)
- Modify: `apps/backend/src/modules/setup/controller/setup.controller.ts` (+ `.spec.ts`)
- Test: `apps/backend/test/setup.e2e-spec.ts`, `apps/backend/test/rate-limit.e2e-spec.ts` (`validRegistration` from Task 4)
- Modify: `README.md` (deploy steps: after `up -d`, run `docker compose logs backend | grep "Setup token"` and enter the token in the setup wizard; a restart before setup issues a new token)

**Interfaces:**

- Produces:
    - `@Injectable() class SetupTokenService implements OnApplicationBootstrap`, with `readonly token: string` (24 random bytes, base64url, so 32 characters), `matches(candidate: string): boolean` and `onApplicationBootstrap(): Promise<void>`.
    - `RegisterUserDto.setupToken: string` (required, `@IsString() @IsNotEmpty() @MaxLength(256)`).
    - `SetupService.registerFirstUser(user: Omit<UserCreate, 'roleId'>, setupToken: string): Promise<UserWithRole>`.
    - Log line format (Task 6 parses it): `Setup token: <token>`.

- [ ] **Step 1: Write the failing unit tests**
    - `setup-token.service.spec.ts`:
        - `'issues a 32-character url-safe token'` (`/^[A-Za-z0-9_-]{32}$/`)
        - `'matches only its own token'` (true for `token`, false for `token.slice(1)`, `''` and a different 32-char string)
        - `'logs the token on bootstrap while no user exists'` (`count` stub → 0; `Logger.prototype.log` spy called with a string containing `Setup token: ${service.token}`)
        - `'does not log the token once a user exists'` (`count` → 1)
    - `setup.service.spec.ts`: `'rejects a wrong setup token with 403 before opening a transaction'` (`ForbiddenException` with the message `Invalid setup token`; `sequelize.transaction` not called).
    - `setup.controller.spec.ts`: `'passes the setup token separately and never into the user'` (`registerFirstUser` called with `({ firstName, lastName, email, password }, 'the-token')`).
    - `register-user.dto.spec.ts`: missing `setupToken` fails validation.

- [ ] **Step 2: Run** `pnpm --filter backend exec vitest run src/modules/setup`. Expected: FAIL.

- [ ] **Step 3: Implement.**
    - **`matches`:** compare `createHash('sha256')` digests of both strings with `timingSafeEqual`.
    - **`onApplicationBootstrap`:** count `UserModel` rows. When there are 0, log at `log` level: `No user exists yet. Setup token: ${this.token}`. The token lives only in memory. It does not need to be cleared after registration, because `registerFirstUser` refuses once any user exists.
    - **The controller** destructures `{ setupToken, ...user }`.
    - **`SetupService`** checks the token first (outside the transaction), then keeps today's logic.

- [ ] **Step 4: Update `setup.e2e-spec.ts`.** `registration` gets `setupToken: app.get(SetupTokenService).token` (set in `beforeAll`). Add:

```ts
it('refuses registration with a wrong setup token and creates no user', async () => {
    await http()
        .post('/api/setup/user')
        .send({ ...registration, setupToken: 'x'.repeat(32) })
        .expect(403)
    expect(await userModel.count()).toBe(0)
})

it('refuses registration without a setup token', async () => {
    const { setupToken: _omitted, ...withoutToken } = registration
    await http().post('/api/setup/user').send(withoutToken).expect(400)
})
```

(Both run before `'registers the first user and returns a usable token'`.) Give Task 4's `validRegistration` the same `setupToken` source.

- [ ] **Step 5: Run** `pnpm --filter backend exec vitest run src/modules/setup`, then `pnpm --filter backend exec vitest run --config vitest.config.e2e.ts test/setup.e2e-spec.ts test/bootstrap.e2e-spec.ts test/rate-limit.e2e-spec.ts`. Expected: PASS. Then `pnpm build --filter api`. Expected: `RegisterUserDto` in `packages/api/dist` has `setupToken: string`.

- [ ] **Step 6: Dev-loop check.** Start `pnpm dev` against an empty dev database. Expected: the backend output shows `Setup token: …` once per (re)start. Stop it.

- [ ] **Step 7: No commit.**

---

### Task 6: Setup token in onboarding and Playwright (#15)

**Files:**

- Modify: `apps/frontend/src/modules/onboarding/views/partials/OnboardingAccountStep.vue`
- Modify: `apps/frontend/src/locales/en.json` (`module.setup.account.setupTokenLabel`, `module.setup.account.setupTokenHint`)
- Test: `apps/frontend/src/modules/onboarding/views/__tests__/OnboardingView.spec.ts`, `apps/frontend/src/modules/onboarding/mutations/__tests__/useRegisterMutation.spec.ts`
- Modify: `apps/frontend/e2e/support/processes.ts` (new `waitForLogLine`), `apps/frontend/e2e/support/global-setup.ts`, `apps/frontend/e2e/support/fixtures.ts` (`requireEnv` accepts `'E2E_SETUP_TOKEN'`), `apps/frontend/e2e/01-onboarding.spec.ts`

**Interfaces:**

- Consumes: `RegisterUserDto.setupToken` (Task 5) and the log line `Setup token: <32 chars>`.
- Produces: `waitForLogLine(logFile: string, pattern: RegExp, timeoutMs?: number): Promise<RegExpExecArray>`, which polls the file until it matches (default 10 s) or throws, including the log tail. Also the env `E2E_SETUP_TOKEN`.

- [ ] **Step 1: Write the failing unit tests.**
    - `OnboardingView.spec.ts`: `'sends the setup token with the account'`. Fill all account fields plus `setupToken`, submit, and assert the mocked register call got `expect.objectContaining({ setupToken: 'token-from-the-log-0123456789abcd' })`.
    - `'requires the setup token'`: submit without it, assert the validation message and no call.
    - `useRegisterMutation.spec.ts`: the body passed to `SetupApi.registerUser` includes `setupToken`.

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/modules/onboarding`. Expected: FAIL.

- [ ] **Step 3: Implement.**
    - **The field:** add `setupToken` to the step's Zod schema (`z.string().trim().min(1)`). Render it as the first field, spanning both grid columns: a `VTextField` with `name="setupToken"`, `autocomplete="off"` and monospace text.
    - **Copy:**
        - label `Setup token`
        - hint: `The backend writes it to its log on startup while no account exists. On the server: docker compose logs backend | grep "Setup token"`
    - **The server's 403** (`Invalid setup token`) already surfaces through the existing `apiErrorMessage` alert.

- [ ] **Step 4: Run** the same specs. Expected: PASS.

- [ ] **Step 5: Playwright.**
    - `global-setup.ts`: right after `startServer(...)` for the backend, run `const [, setupToken] = await waitForLogLine(join(workDir, 'backend.log'), /Setup token: ([A-Za-z0-9_-]{32})/)` and set `process.env.E2E_SETUP_TOKEN = setupToken` next to `E2E_API_URL`.
    - `01-onboarding.spec.ts`: fill `input(page, 'setupToken')` with `requireEnv('E2E_SETUP_TOKEN')` before submitting the account step.
    - Run `pnpm --filter frontend test:e2e` (or that package's Playwright script). Expected: PASS.

- [ ] **Step 6: No commit.**

---

### Task 7: Visible warning for forms without allowed domains (#14)

**Files:**

- Modify: `apps/frontend/src/modules/projects/views/details/partials/ProjectFormsCard.vue` (`#meta` slot)
- Modify: `apps/frontend/src/modules/inbound-forms/views/details/InboundFormDetailView.vue` (`#status` slot)
- Modify: `apps/frontend/src/locales/en.json` (`status.anyWebsite`, plus new copy for `module.inboundForms.details.security.hostnames.emptyWarning`)
- Test: `apps/frontend/src/modules/projects/views/details/__tests__/ProjectFormsCard.spec.ts`, `apps/frontend/src/modules/inbound-forms/views/details/__tests__/InboundFormDetailView.spec.ts`

**Interfaces:**

- Consumes: `InboundFormDto.allowedHostnames: string[]` (already in the generated client). The backend is unchanged.

- [ ] **Step 1: Write the failing tests.** Each spec gets two cases: `'flags a form without allowed domains as open to any website'` (`allowedHostnames: []` → text `Any website` is visible) and `'shows no open-origin warning once domains are allowed'` (`['kunde.at']` → absent). Build the fixtures from the existing helpers in `src/__tests__/fixtures.ts`.

- [ ] **Step 2: Run** `pnpm --filter frontend exec vitest run src/modules/projects/views/details src/modules/inbound-forms/views/details`. Expected: the new cases FAIL.

- [ ] **Step 3: Implement.**
    - **Badge:** `<StatusBadge v-if="form.allowedHostnames.length === 0" tone="warning" :label="t('status.anyWebsite')" />`, before the activity badge in both places.
    - **Copy:**
        - `status.anyWebsite`: `Any website`
        - `emptyWarning`: `No allowed domains: any website can embed and submit this form. Add your website's domains to restrict it.`

- [ ] **Step 4: Run** the same specs. Expected: PASS.

- [ ] **Step 5: No commit.**

---

### Task 8: Keep `?key=` out of our logs (#17)

**Files:**

- Modify: `apps/backend/src/factories/app.setup.ts:83` (`addApiKey` gets a `description`)
- Modify: `deploy/smoke-test.sh` (new check after the throttle check, ~line 278)
- Modify: `README.md:260` (the paragraph about `?key=`)

**Interfaces:** none

- [ ] **Step 1: Add the smoke check** using the script's existing helpers (`dc`, `request`, `fail`, `pass`):
    1. Generate `marker="sdm_smokelog_$(secret | tr -dc 'a-zA-Z0-9' | head -c 24)"`.
    2. Send `POST /api/v1/send?key=$marker` and `GET /api/setup/status?key=$marker` through the proxy.
    3. Then `dc logs --no-color` (all services). If the output contains `$marker`, `fail "an API key from the query string reached a container log"`; otherwise `pass "query-string API keys never reach the container logs"`.

- [ ] **Step 2: Swagger description** for `api-key-query`: `Fallback for clients that cannot set headers. Prefer the Authorization header: query strings can end up in the logs of proxies between the client and this server.`

- [ ] **Step 3: README.** Extend the `?key=` paragraph:
    - Today neither the proxy nor the backend logs request URLs, and the smoke test enforces that.
    - Anyone who turns on Caddy access logs must redact the parameter, with this snippet:
        ```
        log {
            format filter {
                request>uri query {
                    replace key REDACTED
                }
            }
        }
        ```
    - Verify the snippet before writing it: append it to a scratch Caddyfile and run `docker run --rm -v <scratch>:/etc/caddy caddy:2.11.7-alpine caddy adapt --config /etc/caddy/Caddyfile`. Expected: it adapts without error. If the syntax differs in 2.11, document the variant that adapts.

- [ ] **Step 4: Run** `docker build -t ghcr.io/schwarzdavid/mailer-backend:local .` and `IMAGE_TAG=local bash deploy/smoke-test.sh`. Expected: every check passes, including the new one and the existing header/throttle checks (helmet and the 503 path are now in the image).

- [ ] **Step 5: No commit.**

---

### Task 9: Full gate and bookkeeping

**Files:**

- Modify: `CLAUDE.md`, the overview paragraphs:
    - helmet/CORS: `SITE_ADDRESS` is read by the backend; public form routes are open to every origin.
    - The setup token in the log.
    - `AppThrottlerGuard` / `@FailClosedThrottle()` replace `ThrottlerGuard`.
    - Secret minimum length.
- Modify: memory `go-live-readiness-status.md`. Mark Phase 2 done with the rulings table above, item 13 deliberately skipped. Drop the follow-up "Caddy security headers (HSTS, nosniff, Referrer-Policy, frame)", which helmet now covers.

- [ ] **Step 1: Run** `pnpm check`. Expected: lint, typecheck, test and format all green.
- [ ] **Step 2: Run** `pnpm --filter backend test:e2e` and the Playwright suite. Expected: PASS.
- [ ] **Step 3: Update `CLAUDE.md` and the memory file** as listed above.
- [ ] **Step 4: Report** the touched files, the `.env` / dev-database note from Task 1 Step 6, and the outcome of the manual browser check from Task 3 Step 7. No commit.
