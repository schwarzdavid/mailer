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

`dev/docker-compose.yml` provides local Postgres, Redis, and MailHog. Runtime config comes from a root `.env` (gitignored) — see keys referenced in `apps/backend/src/app.module.ts` (`DB_*`, `REDIS_*`, `BACKEND_JWT_SECRET`, `BACKEND_DKIM_SECRET`, `ADMIN_EMAIL`).

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
pnpm --filter backend migrate up   # apply migrations (umzug CLI: up | down | create --name x)
pnpm --filter backend generate     # boot Nest with --spec-only to emit packages/api/assets/openapi.json
pnpm --filter api build            # regenerate the typed client from that spec
```

## Architecture

### The API contract pipeline (spans all three workspaces)

The backend defines the contract; the frontend never hand-writes request/response types:

1. NestJS controllers + DTOs (decorated with `@nestjs/swagger` `@ApiProperty`, wired via the `@nestjs/swagger` CLI plugin in `nest-cli.json`) describe every endpoint.
2. `apps/backend/src/main.ts` builds the OpenAPI document and, in non-production or with `--spec-only`, writes it to `packages/api/assets/openapi.json`.
3. `packages/api` runs `openapi-ts` (`openapi-ts.config.ts`) to emit into `dist/`: SDK classes grouped by tag as `{{Tag}}Api` (e.g. `AuthApi.login`, `AuthApi.currentUser`), plus TS types and Zod schemas. `throwOnError: true` means SDK calls throw on non-2xx.
4. The frontend imports from `api` (SDK + types) and `api/client` (the fetch client, configured in `main.ts`).

After changing any endpoint, regenerate: `pnpm --filter backend generate` then `pnpm --filter api build`.

### Backend (NestJS)

Feature modules live under `src/modules/<feature>/` and follow a consistent layering:

- `controller/` — HTTP boundary; validates input DTOs, delegates to services, maps domain objects to response DTOs.
- `services/` — business logic; the only layer that touches models.
- `models/` — `sequelize-typescript` entities (`@Table`, `@Column`, associations). `autoLoadModels` is on.
- `interfaces/` — plain domain shapes (e.g. `Domain`, `User`) used across layers, decoupled from Sequelize models.
- `dtos/` — request/response shapes; response DTOs expose a static `fromX(...)` mapper (see `DomainDto.fromDomain`).
- `mappers/` — where a model carries secrets, a mapper projects it to the public interface (`user.mapper.ts` strips the password hash — the single chokepoint that keeps hashes out of every layer above persistence).

Cross-cutting wiring (`app.module.ts`): `ConfigModule` (global, reads root `.env`), `SequelizeModule` (Postgres), `CacheModule` (Redis via `@keyv/redis`, global), `JwtModule` (global, 31-day tokens). `BootstrapService.onApplicationBootstrap` seeds an admin user with a random password (logged once) when the users table is empty.

**Auth flow:** Passport with `local` and `jwt` strategies. `JwtAuthGuard` extends the passport JWT guard but honors a `@Public()` metadata marker to skip auth. Apply `@JwtAuth()` (composed decorator) to controllers/routes that require a token. `@Principal()` is a param decorator that returns the authenticated `User` (401s if absent).

**Migrations:** `umzug` over Sequelize, driven by `src/migrate.ts` (not Sequelize CLI). Migration files are `src/migrations/NNN-*.ts` with `up`/`down` taking `{ context: QueryInterface }`. `migrate.ts` resolves migrations via `require` so `ts-node` transpiles them (umzug's default dynamic `import()` bypasses the ts-node hook). `autoLoadModels` builds tables in dev, but migrations are the source of truth for schema.

### Frontend (Vue 3)

Feature-based structure under `src/modules/<feature>/` split into `views/`, `layouts/`, `queries/`, `mutations/` (plus `partials/` for view-local components). Plugins are initialized in `src/main.ts` and configured under `src/plugins/` (`vuetify`, `tanstack` query client, `i18n`).

- **Server state** is TanStack Query. Reads are `useXQuery` composables under `queries/`; writes are `useXMutation` under `mutations/`. Query keys are string arrays (e.g. `['auth.user']`); mutations update the cache via `queryClient.setQueryData`. Never call the SDK directly from components — go through a composable.
- **Routing** (`src/router/index.ts`) nests feature views under shared layouts (`AuthLayout`, `AppLayout`). Route names are centralized in `src/router/RouteNames.ts` — reference the enum, never string literals.
- **Validation & i18n:** vee-validate with Zod schemas. Zod's global error map is wired to vue-i18n in `main.ts`, so validation messages resolve to `validation.*` keys in `src/locales/en.json` — add schema constraints and translation keys together.
- **Dev server** proxies `/api` to `http://localhost:8000` (`vite.config.ts`); `@` aliases `src/`.

## Testing

- **Type-safe test doubles:** type every `vi.fn` with its call signature and hold it as `Mock<…>` — prefer binding to the real collaborator's method (`vi.fn<DomainService['createDomain']>()`) so a signature change breaks the test instead of silently passing. Declare mock inputs/return values with their domain interface or DTO type (`const dkim: DomainDkim = {…}`), never loose literals or `as` casts. For a Sequelize row, model the instance as `Interface & { get(options): Interface }`.
- **Backend unit** (`*.spec.ts` beside source): Vitest with the SWC transform (`vitest.config.ts`). SWC is required — Nest's `emitDecoratorMetadata` (needed for DI) is dropped by the default esbuild/Oxc transform, so `oxc: false` is set.
- **Backend e2e** (`test/**/*.e2e-spec.ts`, `vitest.config.e2e.ts`): a global setup starts throwaway Postgres + Redis via Testcontainers, runs migrations, and publishes connection env through Vitest `provide`/`inject`. `test/support/app.ts` boots the real `AppModule` mirroring `main.ts`. Requires Docker; first run pulls images (long timeouts are set intentionally).
- **Frontend** (`src/**/__tests__/*`, `vitest.config.ts`): jsdom environment. `src/__tests__/setup.ts` stubs browser APIs Vuetify needs; `src/__tests__/support.ts` provides `mountView` (mounts with Vuetify/i18n/Vue Query) and `withVueQuery` (runs a composable in a throwaway app). Vuetify is inlined so Vite strips its per-component CSS imports. E2E is Playwright under `e2e/`.

## Tooling notes

- **ESLint** is flat config. All packages extend a shared `defineBaseConfig` from the root `eslint.config.ts` (type-aware `recommendedTypeChecked`, with `no-explicit-any` off and `no-floating-promises`/`no-unsafe-argument` as warnings), then layer framework rules. The frontend additionally runs `oxlint` (`.oxlintrc.json`) before ESLint — run both via `pnpm --filter frontend lint`.
- **Prettier** owns formatting (ESLint defers to it via `eslint-config-prettier`). A single root config (`prettier.config.ts`) governs every package: 4-space indent, single quotes, no semicolons, trailing commas. Don't hand-format; run the formatter.
- **TypeScript** is strict repo-wide (root `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, etc.), extended per package. The frontend type-checks with `vue-tsc`.
- Package manager is **pnpm** (`packageManager` pins the version). Use `pnpm`, not npm/yarn.
