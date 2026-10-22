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

`dev/docker-compose.yml` provides local Postgres, Redis, MailHog (outbound SMTP sink), and GreenMail (SMTP :3025 / IMAP :3143 — the bounce mailbox: inject DSN mails via its SMTP port and the backend's IMAP poller ingests them). Runtime config comes from a root `.env` (gitignored, template in `.env.example`) — see keys referenced in `apps/backend/src/app.module.ts`, `apps/backend/src/modules/mail/mail.module.ts`, and the bounce module (`DB_*`, `REDIS_*`, `BACKEND_JWT_SECRET`, `BACKEND_ENCRYPTION_SECRET`, `MAIL_HOSTNAME`, `SMTP_*`, `IMAP_*`). `MAIL_HOSTNAME` is the single platform sending domain: the settings API only takes the server IPs (`GET /settings/sending-domain/proposal` pre-fills them from its A/AAAA records), and `SettingsService.onApplicationBootstrap` switches a stored sending domain to `MAIL_HOSTNAME` when they differ (under the advisory lock `SENDING_DOMAIN_LOCK_KEY`). Backend e2e uses `E2E_MAIL_HOSTNAME` (`test/support/sending-domain.ts`), Playwright `sendingDomain` (`e2e/support/fixtures.ts`).

`Dockerfile` (stages `build`, `backend`) and `deploy/` (production `compose.yml`, which only pulls images and never builds, `.env.example`, `smoke-test.sh`) make up the Docker Compose production deployment, with one published image, `ghcr.io/schwarzdavid/mailer-backend`: the backend serves the built SPA itself (only under `NODE_ENV=production`, from the fixed `FRONTEND_PUBLIC_DIR`: `/app/public` in the image, the gitignored `apps/backend/public` from source; it refuses to start if `index.html` is missing there, and serves no static files in any other `NODE_ENV`) and the API under `/api`, and the stock `caddy:2.x-alpine` service `proxy` only terminates TLS, compresses, sets `X-Robots-Tag` and reverse-proxies everything to `backend:8000`; its Caddyfile is inline in `compose.yml` (`configs.content`, values via compose interpolation). The one-shot `migrate` service runs before `backend` starts. On a first deploy that ordering is enough; an update runs `docker compose run --rm migrate` explicitly between `pull` and `up -d` (README runbook), so a failing migration never replaces the serving backend. `NODE_ENV=production` (set by the image) turns off the `/docs` Swagger UI, so `/docs` falls back to the SPA. The `mail` service (docker-mailserver, hostname `MAIL_HOSTNAME`) publishes only port 25, which accepts mail for local recipients only (no relay); the backend submits on 587 and polls the bounce mailbox on 143 over the internal `mail` network, both STARTTLS with the account `bounce@MAIL_HOSTNAME`, and compose sets the backend's `SMTP_*`/`IMAP_*` from `MAIL_*` itself (the backend reads `MAIL_HOSTNAME` directly from `.env` via `env_file` as its sending domain). The backend reaches it by the service name `mail` and verifies its certificate against `MAIL_HOSTNAME` through `SMTP_TLS_SERVERNAME`/`IMAP_TLS_SERVERNAME`; `MAIL_HOSTNAME` is deliberately not a network alias, so the domain DNS checks resolve it publicly. Its TLS certificate is the one the `proxy` (Caddy) obtains for `MAIL_HOSTNAME`, read from the `caddy-data` volume.

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
pnpm --filter backend build && pnpm --filter backend migrate:prod up       # the production path: node dist/migrate.js up
pnpm build --filter api            # backend build → backend#generate (spec, no DB needed) → typed client
```

Production stack (needs Docker, curl and openssl; the smoke test uses the compose project `mailer-smoke`, ports 18080/18443/18025, and ends with `down -v`):

```bash
docker build -t ghcr.io/schwarzdavid/mailer-backend:local .   # build the backend image (the last Dockerfile stage)
IMAGE_TAG=local bash deploy/smoke-test.sh   # run the stack from the local images and check routing, headers, throttling, migrations, mail relay/submission/bounce ingestion and the mail certificate lifecycle
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

Cross-cutting wiring (`app.module.ts`): `ConfigModule` (global, reads root `.env`, validated at boot by the Zod `envSchema` in `src/config/env.schema.ts` — the single home for env defaults and coercion; read values via `ConfigService<Env, true>` + `get(key, { infer: true })`), `SequelizeModule` (Postgres), `CacheModule` (Redis via `@keyv/redis`, global), `JwtModule` (global, 31-day tokens). The setup module registers the first user via public endpoints (GET /setup/status, POST /setup/user); no admin user is seeded.

**Auth flow:** Passport with `local` and `jwt` strategies. `JwtAuthGuard` extends the passport JWT guard but honors a `@Public()` metadata marker to skip auth. Apply `@JwtAuth()` (composed decorator) to controllers/routes that require a token. `@Principal()` is a param decorator that returns the authenticated `User` (401s if absent).

**Migrations:** `umzug` over Sequelize, driven by `src/migrate.ts` (not Sequelize CLI). Migration files are `src/migrations/NNN-*.ts` with `up`/`down` taking `{ context: QueryInterface }`. `src/factories/umzug.factory.ts` globs migrations by the runner's own extension (`.ts` under `tsx`, `.js` from `dist/`), so the same code serves `pnpm migrate` in dev and `node dist/migrate.js` in production (`nest build` emits both). Names are stored in `SequelizeMeta` without an extension (`001-create-users`). Every `up`/`down` run is a single transaction (`runInMigrationTransaction`): if any migration fails, all migrations of that run and their `SequelizeMeta` rows are rolled back. Its first statement takes the transaction advisory lock `MIGRATION_LOCK_KEY`, which serialises concurrent runs until commit. Queries without an explicit `transaction` join the run's transaction through a CLS namespace that only answers inside a run, so migrations just use the `QueryInterface`. They must not open their own `sequelize.transaction(...)`, which throws, nor use statements Postgres refuses inside a transaction (`CREATE INDEX CONCURRENTLY`). In production migrations run as a separate one-shot step, `node dist/migrate.js up`, never at app boot. `migrate.ts` validates only the `DB_*` keys and `BACKEND_ENCRYPTION_SECRET`. `autoLoadModels` builds tables in dev, but migrations are the source of truth for schema.

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
