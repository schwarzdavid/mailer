# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working agreement

These rules are set by the repository owner and take precedence over defaults:

- **Read before you write.** Never modify a file without reading it first.
- **Keep the build green.** Every change must pass ESLint and TypeScript, or at minimum introduce no new errors. Verify with `pnpm typecheck` and `pnpm lint` (or the per-package equivalents) before considering work done.
- **Keep tests in step with logic.** When you change business logic, update the corresponding tests and run them. If a change could plausibly break something elsewhere, or is large in scope, run the full test suite (`pnpm test`) to confirm nothing regressed.
- **Never touch git.** Do not `git add`, stage, commit, push, or otherwise alter version-control state. Leave all git operations to the user.
- **No comments.** Write self-explanatory code — clear names over explanatory comments. Existing comments in the tree explain non-obvious _why_ (workarounds, framework quirks); match that bar if a comment is truly unavoidable, but do not narrate _what_ the code does.

## Repository layout

pnpm + Turborepo monorepo. Three workspaces (`apps/*`, `packages/*`):

- `apps/backend` — NestJS API (Sequelize/Postgres, Redis cache, Passport JWT). Source of truth for the API contract.
- `apps/frontend` — Vue 3 SPA (Vuetify, Vue Router, TanStack Query, vue-i18n, vee-validate + Zod).
- `packages/api` — Typed client + Zod schemas generated from the backend's OpenAPI spec by `@hey-api/openapi-ts`. Consumed by the frontend as `api` (`workspace:*`).

`.github/workflows/ci.yml` runs on pushes and pull requests to `main` and on a published GitHub release (`pnpm check`, both e2e suites, then one image build and the smoke test; only a release then pushes that tested image to GHCR, tagged with the semver release version, `sha-<7>` and, for non-pre-releases, `latest`). The Node version lives only in the `Dockerfile` (`ARG NODE_VERSION`); the composite action `.github/actions/setup` reads it from there.

`dev/docker-compose.yml` provides local Postgres, Redis, MailHog (outbound SMTP sink), and GreenMail (SMTP :3025 / IMAP :3143 — the bounce mailbox: inject DSN mails via its SMTP port and the backend's IMAP poller ingests them). Runtime config comes from a root `.env` (gitignored, template in `.env.example`) — the full list with defaults is `apps/backend/src/config/env.schema.ts` (`DB_*` with the required `DB_USERNAME`/`DB_PASSWORD`/`DB_DATABASE` plus `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_POOL_MAX`; `REDIS_*` with `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS`, `REDIS_TLS_SERVERNAME`; `BACKEND_JWT_SECRET`, `BACKEND_ENCRYPTION_SECRET`, `MAIL_HOSTNAME`, `SMTP_*` with `SMTP_REQUIRE_TLS` (default `true`, `false` in `.env.example` because MailHog has no STARTTLS), `IMAP_*`, `TRUST_PROXY`, `LOG_LEVEL`). `MAIL_HOSTNAME` is the single platform sending domain: the settings API only takes the server IPs (`GET /settings/sending-domain/proposal` pre-fills them from its A/AAAA records), and `SettingsService.onApplicationBootstrap` switches a stored sending domain to `MAIL_HOSTNAME` when they differ (under the advisory lock `SENDING_DOMAIN_LOCK_KEY`). Backend e2e uses `E2E_MAIL_HOSTNAME` (`test/support/sending-domain.ts`), Playwright `sendingDomain` (`e2e/support/fixtures.ts`).

`Dockerfile` (stages `build`, `backend`) and `deploy/` (production `compose.yml`, which only pulls images and never builds, `.env.example`, `smoke-test.sh`) make up the Docker Compose production deployment, with one published image, `ghcr.io/schwarzdavid/mailer-backend`: the backend serves the built SPA itself (only under `NODE_ENV=production`, from the fixed `FRONTEND_PUBLIC_DIR`: `/app/public` in the image, the gitignored `apps/backend/public` from source; it refuses to start if `index.html` is missing there, and serves no static files in any other `NODE_ENV`) and the API under `/api`, and the stock `caddy:2.x-alpine` service `proxy` only terminates TLS, compresses, sets `X-Robots-Tag` and reverse-proxies everything to `backend:8000`; its Caddyfile is inline in `compose.yml` (`configs.content`, values via compose interpolation) and its global `log default` filter redacts the `key` query parameter (the API-key fallback) from the access log, which the smoke test checks. There is no separate migrate service: the backend applies pending migrations when it starts, so a first deploy and an update are both `pull` + `up -d`. A failing migration rolls back its whole run and keeps the backend from starting, so the site is down until the operator acts. That trade-off was chosen to keep the VPS setup as simple as possible. `NODE_ENV=production` (set by the image) turns off the `/docs` Swagger UI, so `/docs` falls back to the SPA. The `mail` service (docker-mailserver, hostname `MAIL_HOSTNAME`) publishes only port 25, which accepts mail for local recipients only (no relay); the backend submits on 587 and polls the bounce mailbox on 143 over the internal `mail` network, both STARTTLS with the account `bounce@MAIL_HOSTNAME`, and compose sets the backend's `SMTP_*`/`IMAP_*` from `MAIL_*` itself (the backend reads `MAIL_HOSTNAME` directly from `.env` via `env_file` as its sending domain). The backend reaches it by the service name `mail` and verifies its certificate against `MAIL_HOSTNAME` through `SMTP_TLS_SERVERNAME`/`IMAP_TLS_SERVERNAME`; `MAIL_HOSTNAME` is deliberately not a network alias, so the domain DNS checks resolve it publicly. Its TLS certificate is the one the `proxy` (Caddy) obtains for `MAIL_HOSTNAME`, read from the `caddy-data` volume.

## Common commands

Run from the repo root; Turbo fans tasks out across workspaces.

```bash
pnpm dev            # run all apps in watch mode
pnpm build          # build all workspaces (respects ^build dependency order)
pnpm lint           # eslint across all workspaces
pnpm lint:fix       # eslint --fix
pnpm typecheck      # tsc / vue-tsc --noEmit across all workspaces
pnpm test           # run all test suites
pnpm format:fix     # prettier --write .
pnpm check          # lint + typecheck + test + format (the full gate)
```

Target one workspace with `pnpm --filter backend <script>` or `pnpm --filter frontend <script>`.

`lint`, `typecheck`, `test` and `test:cov` depend on `^build` in `turbo.json`, so on a fresh clone `pnpm lint`/`pnpm test` first build the backend, generate the spec and build the `api` client (Turbo-cached afterwards).

Run a **single test file** (Vitest):

```bash
pnpm --filter backend exec vitest run src/modules/auth/services/credentials.service.spec.ts
pnpm --filter frontend exec vitest run src/modules/auth/views/__tests__/LoginView.spec.ts
# filter by test name:
pnpm --filter backend exec vitest run -t "creates a user"
```

Backend-specific:

```bash
pnpm --filter backend test:e2e     # e2e suite (spins up Postgres/Redis via Testcontainers)
pnpm --filter backend migrate up   # apply migrations from source under tsx (umzug CLI: up | down | pending | executed | create; no command = up)
pnpm --filter backend migrate create --name 019-example.ts --prefix NONE   # new migration file from umzug's default template (type it as MigrationFn<QueryInterface>); source-only (tsx), not for dist (the .ts suffix is required, the NNN is typed by hand)
pnpm --filter backend build && pnpm --filter backend migrate:prod up       # the compiled CLI, node dist/migrate.js (the app itself migrates on start)
pnpm build --filter api            # backend build → backend#generate (spec, no DB needed) → typed client
```

Production stack (needs Docker, curl and openssl; the smoke test uses the compose project `mailer-smoke`, ports 18080/18443/18025, and ends with `down -v`):

```bash
docker build -t ghcr.io/schwarzdavid/mailer-backend:local .   # build the backend image (the last Dockerfile stage)
IMAGE_TAG=local bash deploy/smoke-test.sh   # run the stack from the local images and check routing, headers, JSON request logs, health/readiness, throttling, migrations, mail relay/submission/bounce ingestion and the mail certificate lifecycle
```

## Architecture

### The API contract pipeline (spans all three workspaces)

The backend defines the contract; the frontend never hand-writes request/response types:

1. NestJS controllers + DTOs (decorated with `@nestjs/swagger` `@ApiProperty`, wired via the `@nestjs/swagger` CLI plugin in `nest-cli.json`) describe every endpoint.
2. `apps/backend/dist/openapi.js` (from `src/openapi.ts`) builds the OpenAPI document in Nest preview mode (no DB or Redis, placeholder env filled in by the script) and writes it to the path given as its argument. The backend's `generate` script runs it into `apps/backend/openapi.json`, a gitignored output of the Turbo task `generate` (which depends on the backend `build`); `main.ts` writes nothing.
3. `api#build` depends on `backend#generate` in `turbo.json` and runs `openapi-ts` (`openapi-ts.config.ts`, input `apps/backend/openapi.json`) to emit into `dist/`: SDK classes grouped by tag as `{{Tag}}Api` (e.g. `AuthApi.login`, `AuthApi.currentUser`), plus TS types and Zod schemas. `throwOnError: true` means SDK calls throw on non-2xx.
4. The frontend imports from `api` (SDK + types) and `api/client` (the fetch client, configured in `main.ts`).

After changing any endpoint, regenerate with `pnpm build --filter api` (Turbo builds the backend first). Under `pnpm dev`, Turbo first runs `backend#build`, `backend#generate` and `api#build`, and only then starts the dev tasks. `backend#dev` waits for `generate` because `nest start --watch` empties `dist` on start. `packages/api/scripts/watch.ts` then runs the backend's `generate` script after each backend rebuild: one run at a time, after the output has settled. `openapi-ts` only runs when the spec actually changed.

### Backend (NestJS)

NestJS 12, native ESM (`"type": "module"`, `nodenext` resolution): relative imports carry a `.js` extension (`./app.module.js`, `./dtos/index.js` for directories), and `import.meta.dirname` replaces `__dirname`. Under ESM, decorator metadata that names a circularly imported class throws a TDZ `ReferenceError` at load time, so type singular model associations as `Relation<OtherModel>` (`src/types/relation.ts`); arrays and `X | null` unions are already safe.

Feature modules live under `src/modules/<feature>/` and follow a consistent layering:

- `controller/` — HTTP boundary; validates input DTOs, delegates to services, maps domain objects to response DTOs.
- `services/` — business logic; the only layer that touches models.
- `models/` — `sequelize-typescript` entities (`@Table`, `@Column`, associations). `autoLoadModels` is on.
- `interfaces/` — plain domain shapes (e.g. `Domain`, `User`) used across layers, decoupled from Sequelize models.
- `dtos/` — request/response shapes; response DTOs expose a static `fromX(...)` mapper (see `DomainDto.fromDomain`).
- `mappers/` — where a model carries secrets, a mapper projects it to the public interface (`user.mapper.ts` strips the password hash — the single chokepoint that keeps hashes out of every layer above persistence).

Cross-cutting wiring (`app.module.ts`): `ConfigModule` (global, reads root `.env`, validated at boot by the Zod `envSchema` in `src/config/env.schema.ts` — the single home for env defaults and coercion; read values via `ConfigService<Env, true>` + `get(key, { infer: true })`), `SequelizeModule` (Postgres), `CacheModule` (Redis via `@keyv/redis`, global), `JwtModule` (global, 31-day tokens). `BACKEND_JWT_SECRET` and `BACKEND_ENCRYPTION_SECRET` must be at least 32 characters in every `NODE_ENV`. The setup module registers the first user via public endpoints (GET /setup/status, POST /setup/user); no admin user is seeded. While no user exists, `SetupTokenService` logs `Setup token: <token>` at startup and `POST /setup/user` requires it as `setupToken` (Playwright reads it from `backend.log`, `e2e/support/global-setup.ts`). `configureApp` (`src/factories/app.setup.ts`) applies `helmetOptions` (security headers; the CSP allows `'unsafe-eval'` for in-browser Handlebars and `img-src https:`, and drops `upgrade-insecure-requests` so a plain-HTTP site still loads) and `corsOptionsFor`: no CORS headers anywhere (the SPA is same-origin), except `/api/public/form/*`, which is open to every origin (`client.js` also sends `Cross-Origin-Resource-Policy: cross-origin`). The OpenAPI document has no `servers` entry. Rate limiting uses `AppThrottlerGuard` (`src/modules/throttler-storage/guards/`) instead of `ThrottlerGuard`: when Redis is down `ThrottlerStorageService` throws `ThrottlerStorageUnavailableError` and the guard lets the request through with a warning, except on routes marked `@FailClosedThrottle()` (login and setup), which answer 503.

**Logging:** `nestjs-pino` (`LoggerModule.forRootAsync` with `createLoggerOptions` from `src/factories/logger.options.ts`; `main.ts` creates the app with `bufferLogs: true` and installs it with `useLogger`), so Nest's own `Logger` keeps working in services. Under `NODE_ENV=production` it writes one JSON object per line, elsewhere single-line `pino-pretty`; the level is `LOG_LEVEL`. Each request gets a UUID `reqId`, returned as `X-Request-Id`; the request serializer keeps only method, path without query string, client IP and status code, and `/api/health*` is not auto-logged, so `?key=` API keys, headers and bodies never reach the log (the smoke test greps the JSON line by its `reqId`). Name records by id in log messages, never by e-mail address, and log `describeError(error)` (`src/helpers/describe-error.ts`, name and code only) instead of `error.message` wherever the message can carry an address (SMTP errors do).

**Health:** `HealthModule` (`@nestjs/terminus`, controller `@Public()`, `@SkipThrottle()`, `@ApiExcludeController()`). `GET /api/health` is liveness: the database answers `SELECT 1` within 3 s; the production compose healthcheck uses it. `GET /api/health/ready` is readiness: database, Redis `PING` (the throttler's client) and SMTP `transporter.verify()` within 5 s; `ReadinessService` shares one run between concurrent callers and caches its result for 10 s after it settles. Readiness is `503` whenever `mail` is down, so never make it the container healthcheck. Failed checks report `describeError` output through `probeWithin`, never the error text.

**Auth flow:** Passport with `local` and `jwt` strategies. `JwtAuthGuard` extends the passport JWT guard but honors a `@Public()` metadata marker to skip auth. Apply `@JwtAuth()` (composed decorator) to controllers/routes that require a token. `@Principal()` is a param decorator that returns the authenticated `User` (401s if absent).

**Single-instance jobs:** `AppLocksModule` (`src/modules/locks/`) wires `@nestjs/locks` (pinned to `0.0.4`) to `SequelizeLockStore`, a Postgres lock store on the `locks` table and the `locks_fencing_token_seq` sequence (migration 020) with one SQL statement per call. The store registers itself with `LocksStorage` in its constructor, which also satisfies the package's guard that fails startup under `NODE_ENV=production` when no store is registered. Every new `@Interval`/`@Cron` job gets `@OnOneInstance({ key: '<feature>:<job>' })` and `@WithoutOverlapping()` on the same method, with an explicit key (the default key is the class and method name, which a rename changes). A decorated method throws unless `LocksModule` discovered its instance at init, so put the job's logic in an undecorated public method that unit specs call, and a spec that calls the handler itself imports `LocksModule.forRoot()` (in-memory store outside production) and runs `module.init()`. `test/lock-store.e2e-spec.ts` runs the package's `lockStoreContract` against the store. The bounce poller keeps its own transaction advisory lock (`BOUNCE_POLL_LOCK_KEY`).

**Inbound-form deliveries:** BullMQ on the shared Redis (`BullModule.forRootAsync` in `app.module.ts`, connection from `createIoRedisOptions` with `maxRetriesPerRequest: null`; constants in `inbound-form.constants.ts`). `InboundFormSubmissionService.submitForm` commits the submission and its `pending` `inbound_form_delivery` rows in one transaction, then `InboundFormDeliveryQueueService.enqueue`s each id (`jobId` `delivery-<id>` dedupes, 8 attempts, exponential backoff from 60 s; an enqueue failure or its 2 s timeout is logged and the request still succeeds). The worker, `InboundFormDeliveryProcessor`, runs in the backend process itself and calls `InboundFormDeliveryService.deliver(id, isLastAttempt)`, which skips rows that are no longer `pending`, marks failures before `sendMail` (deleted receiver or template, empty recipient field, render error) and non-transient `MailSendError`s `failed` without rethrowing, and rethrows every other `sendMail` failure (transient `MailSendError`s and errors raised before the mail was logged) so BullMQ retries it (`MailSendError.transient` comes from `isTransientSmtpError` in `src/modules/mail/helpers/smtp-error.ts`; the shared transporter is pooled with connection/greeting timeouts of 10 s). The DB row is the source of truth: `InboundFormDeliveryRecoveryService.recoverStalled` (every minute) re-enqueues rows still `pending` two minutes plus the retry pause of their last attempt (`60 s · 2^(attempts-1)`, mirroring BullMQ's exponential backoff, computed in SQL) after their last update, so a row that is merely waiting for its next retry is not touched; a resend by hand therefore resets `attempts` to 0. A Redis outage only delays deliveries, but Redis must never evict queued jobs: the production compose runs it with `--appendonly yes --maxmemory-policy noeviction`. Logs on this path name ids and error names/codes only (`describeError` in `src/helpers/describe-error.ts`), never `error.message`, which can carry recipient addresses. The e2e setup file `test/support/queue-reset.ts` obliterates the queue before each file.

**Migrations:** `umzug` over Sequelize, driven by `src/migrate.ts` (not Sequelize CLI). Migration files are `src/migrations/NNN-*.ts` with `up`/`down` taking `{ context: QueryInterface }`. `src/factories/umzug.factory.ts` globs migrations by the runner's own extension (`.ts` under `tsx`, `.js` from `dist/`), so the same code serves `pnpm migrate` in dev and `node dist/migrate.js` in production (`nest build` emits both). Names are stored in `SequelizeMeta` without an extension (`001-create-users`). Every `up`/`down` run is a single transaction (`runInMigrationTransaction`): if any migration fails, all migrations of that run and their `SequelizeMeta` rows are rolled back. Its first statement takes the transaction advisory lock `MIGRATION_LOCK_KEY`, which serialises concurrent runs until commit. Queries without an explicit `transaction` join the run's transaction through a CLS namespace that only answers inside a run, so migrations just use the `QueryInterface`. They must not open their own `sequelize.transaction(...)`, which throws, nor use statements Postgres refuses inside a transaction (`CREATE INDEX CONCURRENTLY`). `main.ts` runs `createUmzug(...).up()` on the app's own connection right after `NestFactory.create` and before `listen`, so lifecycle hooks such as `SettingsService.onApplicationBootstrap` see the migrated schema; a failed run throws and the process exits. This applies in every environment, `pnpm dev` included. E2E apps from `test/support/app.ts` do not migrate; the Vitest global setup does it. `migrate.ts` is the CLI for running, listing and reverting migrations without starting the app. It validates only the `DB_*` keys and `BACKEND_ENCRYPTION_SECRET`. `autoLoadModels` builds tables in dev, but migrations are the source of truth for schema.

### Frontend (Vue 3)

Feature-based structure under `src/modules/<feature>/` split into `views/`, `layouts/`, `queries/`, `mutations/` (plus `partials/` for view-local components). Plugins are initialized in `src/main.ts` and configured under `src/plugins/` (`vuetify`, `tanstack` query client, `i18n`).

- **Server state** is TanStack Query. Reads are `useXQuery` composables under `queries/`; writes are `useXMutation` under `mutations/`. Query keys are string arrays (e.g. `['auth.user']`); mutations update the cache via `queryClient.setQueryData`. Never call the SDK directly from components — go through a composable.
- **Routing** (`src/router/index.ts`) nests feature views under shared layouts (`AuthLayout`, `AppLayout`). Route names are centralized in `src/router/RouteNames.ts` — reference the enum, never string literals.
- **Validation & i18n:** vee-validate with Zod schemas. Zod's global error map is wired to vue-i18n in `main.ts`, so validation messages resolve to `validation.*` keys in `src/locales/en.json` — add schema constraints and translation keys together.
- **Dev server** proxies `/api` to `http://localhost:8000` (`vite.config.ts`); `@` aliases `src/`.

## Testing

- **Type-safe test doubles:** type every `vi.fn` with its call signature and hold it as `Mock<…>` — prefer binding to the real collaborator's method (`vi.fn<DomainService['createDomain']>()`) so a signature change breaks the test instead of silently passing. Declare mock inputs/return values with their domain interface or DTO type (`const dkim: DomainDkim = {…}`), never loose literals or `as` casts. For a Sequelize row, model the instance as `Interface & { get(options): Interface }`.
- **Backend unit** (`*.spec.ts` beside source): Vitest with the SWC transform (`vitest.config.ts`). SWC is required — Nest's `emitDecoratorMetadata` (needed for DI) is dropped by the default esbuild/Oxc transform, so `oxc: false` is set.
- **Backend e2e** (`test/**/*.e2e-spec.ts`, `vitest.config.e2e.ts`): a global setup starts throwaway Postgres + Redis via Testcontainers, runs migrations, and publishes connection env through Vitest `provide`/`inject`; the `test/support/env.ts` setup file copies it into `process.env` before any test file imports `AppModule` (config is validated at import). `test/support/app.ts` boots the real `AppModule` with the shared `appOptions`, mirroring `main.ts`. Requires Docker; first run pulls images (long timeouts are set intentionally).
- **Frontend** (`src/**/__tests__/*`, `vitest.config.ts`): jsdom environment. `src/__tests__/setup.ts` stubs browser APIs Vuetify needs; `src/__tests__/support.ts` provides `mountView` (mounts with Vuetify/i18n/Vue Query) and `withVueQuery` (runs a composable in a throwaway app). Vuetify is inlined so Vite strips its per-component CSS imports. E2E is Playwright under `e2e/`.

## Tooling notes

- **ESLint** is flat config. All packages extend a shared `defineBaseConfig` from the root `eslint.config.ts` (type-aware `recommendedTypeChecked`, with `no-explicit-any` off and `no-floating-promises`/`no-unsafe-argument` as warnings), then layer framework rules. The frontend additionally runs `oxlint` (`.oxlintrc.json`) before ESLint — run both via `pnpm --filter frontend lint`.
- **Prettier** owns formatting (ESLint defers to it via `eslint-config-prettier`). A single root config (`prettier.config.ts`) governs every package: 4-space indent, single quotes, no semicolons, trailing commas. Don't hand-format; run the formatter.
- **TypeScript** is strict repo-wide (root `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, etc.), extended per package. The frontend type-checks with `vue-tsc`.
- Package manager is **pnpm** (`packageManager` pins the version). Use `pnpm`, not npm/yarn.
