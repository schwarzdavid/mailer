# Production Migrations & DB-free OpenAPI Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrations run from the production build (`node dist/migrate.js up`) safely and serially, and `pnpm build` produces the OpenAPI spec and api client from a clean checkout without Postgres or Redis, without committing the spec.

**Architecture:** A shared `createUmzug(sequelize)` factory owns migration discovery (by the runner's own file extension), extensionless migration names and a Postgres session advisory lock wired to umzug's `beforeCommand`/`afterCommand` events. `migrate.ts` and the e2e test support both use it. A new `src/openapi.ts` entry creates the app in Nest's preview mode (no provider instantiation, so no DB/Redis), builds the document and writes it to a path given as argument; `packages/api` declares `backend` as a workspace devDependency so Turbo's `^build` builds the backend first, then its own build generates the spec and runs `openapi-ts`.

**Tech Stack:** NestJS 12 (ESM, preview mode), umzug 3 (`runAsCLI`, command events), Sequelize 6 / pg, Zod 4, Turborepo 2, `@hey-api/openapi-ts`, chokidar-cli, Vitest + Testcontainers.

**Spec:** No separate spec document. The decisions below come from the session of 2026-10-21 and are fixed in Global Constraints.

## Global Constraints

- **Never touch git** (CLAUDE.md). There are no commit steps; the owner handles git.
- **No comments** in code; the existing _why_-comments are the bar. Remove the comments that the change makes false (e.g. the tsx comment in `migrate.ts` if the code it explains moves).
- Backend ESM: relative imports end in `.js`.
- Test doubles follow CLAUDE.md "Testing" (`vi.fn<Service['method']>()`, typed inputs, no `as` casts).
- Every task ends green: `pnpm --filter backend typecheck && pnpm --filter backend lint && pnpm --filter backend test`. Tasks that touch e2e also run `pnpm --filter backend test:e2e`.
- **The spec file is never committed.** `packages/api/assets/openapi.json` stays gitignored and is only a build output.
- **Migration names are stored without an extension** in `SequelizeMeta` (`001-create-users`, not `001-create-users.ts`). There is no compat code in the runner. Existing dev DBs are converted once by hand (Task 1, Step 6).
- Migration lock: Postgres session advisory lock, key `MIGRATION_LOCK_KEY = 815_003`. Keys `815_001` (bounce poll) and `815_002` (setup) are taken. `@nestjs/locks` is deliberately **not** used here (see Review Focus 5).
- Migrations run as their own one-shot step (`node dist/migrate.js up`), never at app startup.
- Spec generation must not need a reachable DB or Redis and must not write anything when the server starts. `main.ts` no longer writes the spec at all.
- Verified on 2026-10-21 by a spike: preview mode yields a document identical to the booted app's (47 paths). The only difference was `info.version` `0.0.1` vs `0.0.0`, because `npm_package_version` is missing outside the backend's own pnpm script. Task 5 fixes this.

## Review Focus

1. **Two deploys run `migrate up` at the same time.** Exactly one applies each migration; the other waits, then finds nothing pending and exits 0. Pinned in Task 2.
2. **Runner crashes while holding the lock.** The session lock is gone as soon as its connection closes, so the next run is not blocked forever. Pinned in Task 2 (a closed connection releases the lock).
3. **The env schema gains a new required key later.** Spec generation in CI must not start failing silently. Pinned in Task 5 (the placeholder env must satisfy `envSchema`).
4. **`dist` contains `.d.ts` and `.js.map` next to each migration.** The glob must pick exactly one file per migration. Pinned in Task 1 (count of executed migrations equals count of source files).
5. **Why not `@nestjs/locks`:**
   - Version 0.0.4, first released 2026-09-25.
   - It ships only an in-memory store. A Postgres store would need its own table, and therefore a migration, before the migration lock can be taken.
   - A Redis store would make the runner depend on Redis, which `migrate.ts` avoids on purpose.
   - Its leases expire by TTL. A Postgres session lock lives exactly as long as the connection.

   `@nestjs/locks` remains a candidate for the scheduled jobs (DNS health, project purge, bounce poller via `@OnOneInstance`/`@WithoutOverlapping`), which is a separate follow-up.

---

## Part B: Migrations (first)

### Task 1: Shared umzug factory, extensionless names, migrations in the build

**Files:**
- Create: `apps/backend/src/factories/umzug.factory.ts`
- Modify: `apps/backend/src/migrate.ts` (use the factory and `runAsCLI`)
- Modify: `apps/backend/tsconfig.build.json` (remove the excludes `src/migrate.ts` and `src/migrations/**`)
- Modify: `apps/backend/package.json` (move `umzug` from devDependencies to dependencies)
- Modify: `apps/backend/test/support/migrations.ts` (`runMigrations` uses the factory; `loadMigrations`/`listMigrationFiles` stay unchanged for the per-migration specs)
- Create: `apps/backend/test/migration-runner.e2e-spec.ts`

**Interfaces:**
- Produces: `createUmzug(sequelize: Sequelize): Umzug<QueryInterface>` from `src/factories/umzug.factory.ts`.
  - Glob: `migrations/*<ext>` with `cwd` = `join(import.meta.dirname, '..')`, where `<ext>` is `extname(import.meta.filename)`. That is `.ts` under tsx and Vitest, `.js` in `dist`.
  - `resolve` keeps today's dynamic `import(pathToFileURL(path))` and returns `name` without its extension.
  - Storage: `SequelizeStorage({ sequelize })`; `create.folder`/`template` move over unchanged from `migrate.ts`.
- Produces: `runMigrations(env: E2eEnv)` (test support, unchanged signature) now calls `createUmzug(sequelize).up()`.

- [ ] **Step 1: Write the failing e2e test** in `test/migration-runner.e2e-spec.ts`. It creates its own database `migration_runner` (follow the admin-connection pattern of `test/migrations.e2e-spec.ts`) and runs `createUmzug(createConnection(env, 'migration_runner')).up()`.
  - `it('records every migration once, by name without extension')`:
    - `executed()` names equal `(await listMigrationFiles()).map((file) => file.replace(/\.ts$/, ''))`.
    - No name ends in `.ts` or `.js`.
  - `it('has nothing pending after up')`: `pending()` is `[]`.
- [ ] **Step 2: Run it and verify it fails.**
  - Run: `pnpm --filter backend exec vitest run --config ./vitest.config.e2e.ts test/migration-runner.e2e-spec.ts`
  - Expected: FAIL, because the import `../src/factories/umzug.factory.js` cannot be resolved.
- [ ] **Step 3: Implement `createUmzug` and switch `migrate.ts`.** `main()` builds the context as before and calls `await createUmzug(sequelize).runAsCLI()` instead of `.up()`. A `false` result sets `process.exitCode = 1`. Remove the two excludes from `tsconfig.build.json` and move `umzug` to `dependencies`. Point `runMigrations` in test support at the factory.
- [ ] **Step 4: Run the new spec and the full backend e2e suite.**
  - Run: `pnpm --filter backend test:e2e`
  - Expected: PASS, including the six per-migration specs.
- [ ] **Step 5: Verify the build output.**
  - Run: `pnpm --filter backend build`, then list `apps/backend/dist/migrations/*.js`.
  - Expected: 18 `.js` files, plus `dist/migrate.js`.
- [ ] **Step 6: Convert existing dev DBs (manual, one-off) and verify the CLI.** On the dev DB:

  ```sql
  UPDATE "SequelizeMeta" SET name = regexp_replace(name, '\.ts$', '');
  ```

  Then run `pnpm --filter backend migrate executed`. Expected: 18 extensionless names.
  Then run `pnpm --filter backend migrate pending`. Expected: empty.

  Find out the exact `create` invocation that produces `NNN-name.ts` with the existing template (umzug's `--prefix NONE` / `--allow-extension .ts` flags) and carry it into Task 4's docs. If `create` cannot be made to work cleanly, Task 4 drops it from the docs.

### Task 2: Advisory lock against concurrent runs

**Files:**
- Modify: `apps/backend/src/factories/umzug.factory.ts`
- Modify: `apps/backend/test/migration-runner.e2e-spec.ts`

**Interfaces:**
- Consumes: `createUmzug` (Task 1).
- Produces: `MIGRATION_LOCK_KEY = 815_003` (exported from `umzug.factory.ts`).
  - On `beforeCommand`, `createUmzug` takes a dedicated raw connection via `sequelize.connectionManager.getConnection()` and runs `SELECT pg_advisory_lock($1)` on it.
  - On `afterCommand`, it runs `pg_advisory_unlock` and `releaseConnection`.
  - The lock does not depend on the pool size.

- [ ] **Step 1: Write the failing tests** in `test/migration-runner.e2e-spec.ts`, each against its own fresh database.
  - `it('applies each migration exactly once when two runners start together')`:
    - Two `createUmzug` instances on two separate `createConnection` objects run `Promise.all([a.up(), b.up()])`.
    - Both resolve.
    - `SELECT name, count(*) FROM "SequelizeMeta" GROUP BY name HAVING count(*) > 1` returns no rows.
    - The applied migrations taken together equal the full list.
  - `it('releases the lock when the holding connection closes')`:
    - Connection A takes `pg_advisory_lock(815003)` via a plain query, then `sequelize.close()`.
    - A `createUmzug(...).up()` on another connection then finishes within the test timeout.
- [ ] **Step 2: Run them and verify the concurrency test fails.**
  - Run: same command as Task 1, Step 2.
  - Expected: FAIL. Typical errors are `relation "users" already exists` or a duplicate `SequelizeMeta` row.
- [ ] **Step 3: Implement the lock hooks in `createUmzug`.** The connection is released on `afterCommand` even when the command threw. Umzug emits `afterCommand` in a `finally`, see `umzug/lib/umzug.js:124-129`.
- [ ] **Step 4: Run the full backend e2e suite.**
  - Run: `pnpm --filter backend test:e2e`
  - Expected: PASS.

### Task 3: Env validation in the migration runner

**Files:**
- Modify: `apps/backend/src/config/env.schema.ts`
- Modify: `apps/backend/src/config/env.schema.spec.ts`
- Modify: `apps/backend/src/migrate.ts`

**Interfaces:**
- Produces: `migrationEnvSchema` from `env.schema.ts`. It is built from the same field schemas as `envSchema` (extract the fields into a shared `envShape` object; `envSchema = z.object(envShape).superRefine(...)` stays as it is). It contains `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` and `BACKEND_ENCRYPTION_SECRET`.
- `migrate.ts` passes `validationSchema: migrationEnvSchema` to `ConfigModule.forRoot`.

- [ ] **Step 1: Write the failing unit tests** in `env.schema.spec.ts`:
  - `migrationEnvSchema` accepts `{ BACKEND_ENCRYPTION_SECRET: 'x' }` and yields `DB_HOST: 'localhost'`.
  - It rejects `{}`, with an issue at the path `BACKEND_ENCRYPTION_SECRET`.
  - It accepts an env without `SMTP_HOST` or `BACKEND_JWT_SECRET`.
- [ ] **Step 2: Run them and verify they fail.**
  - Run: `pnpm --filter backend exec vitest run src/config/env.schema.spec.ts`
  - Expected: FAIL, because `migrationEnvSchema` is not exported.
- [ ] **Step 3: Implement `envShape` and `migrationEnvSchema`, and wire the schema into `migrate.ts`.**
- [ ] **Step 4: Run the unit and e2e tests.**
  - Run: `pnpm --filter backend test && pnpm --filter backend test:e2e`
  - Expected: PASS.

### Task 4: Production path for migrations, used by the frontend e2e

**Files:**
- Modify: `apps/backend/package.json` (add the script `"migrate:prod": "node dist/migrate.js"`)
- Modify: `apps/frontend/e2e/support/global-setup.ts` (migrate with `node <backendWorkDir>/dist/migrate.js up` instead of `pnpm --filter backend migrate up`)
- Modify: `README.md` (step 4, "Run the database migrations"; add a short "Production" note: run `node dist/migrate.js up` as a one-shot step before starting the app)
- Modify: `CLAUDE.md` ("Migrations" paragraph and the command list: build output, extensionless names, lock, `runAsCLI` commands `up | down | pending | executed`, plus `create` as found in Task 1, Step 6)

- [ ] **Step 1: Switch the e2e global setup.** The e2e build (`node_modules/.tmp/e2e`) extends `tsconfig.build.json`, so it now contains `dist/migrate.js`.
- [ ] **Step 2: Run the frontend e2e suite.**
  - Run: `pnpm --filter frontend test:e2e`
  - Expected: PASS. `node_modules/.tmp/e2e/migrate.log` lists 18 migrated names without extensions.
- [ ] **Step 3: Update the docs.** Then run `pnpm format:fix`.

---

## Part A: OpenAPI spec without a DB, without a commit

> **Amended after implementation (2026-10-21, owner review).** Tasks 6 and 7 below describe the first version, which was then replaced:
> - **Spec generation:** the spec is no longer written by `api#build` via `node_modules/backend`, and the `backend` workspace devDependency is gone. The backend's `generate` script (`node dist/openapi.js openapi.json`) writes `apps/backend/openapi.json`. In Turbo, `generate` depends on `build` and outputs `openapi.json`, so the spec stays inside the producer's package and Turbo can restore it from the cache.
> - **Client build:** `api#build` depends on `backend#generate` and runs only `openapi-ts`, whose input is `../../apps/backend/openapi.json`. `packages/api/assets` no longer exists.
> - **Dev watcher:** `chokidar-cli` was replaced by `packages/api/scripts/watch.ts`. After each backend rebuild it runs the backend's `generate` script, one run at a time and only once the output has settled, and it runs `openapi-ts` only when the spec changed.
> - **Dev ordering:** `dev` depends on `^build` and `backend#dev` on `generate`, so a fresh clone works with `pnpm dev` alone.
> - **Migration template:** the custom `create` template was dropped in favour of umzug's default `.ts` template.

### Task 5: Preview-mode spec generator

**Files:**
- Create: `apps/backend/src/openapi/spec-env.ts`
- Create: `apps/backend/src/openapi/spec-env.spec.ts`
- Create: `apps/backend/src/openapi/preview-document.ts`
- Create: `apps/backend/src/openapi.ts` (entry point, next to `main.ts`/`migrate.ts`)
- Modify: `apps/backend/src/factories/app.setup.ts`:
  - Add `export const API_PREFIX = 'api'` and use it in `configureApp`.
  - `createOpenApiDocument` reads the version from `apps/backend/package.json`: `readFileSync(join(import.meta.dirname, '..', '..', 'package.json'))`, the same relative path from `src/factories` and `dist/factories`. It no longer uses `npm_package_version`.
- Modify: `apps/backend/test/openapi.e2e-spec.ts`
- Modify: `apps/backend/vitest.config.ts` (add `src/openapi.ts` to the coverage excludes, like `main.ts`)

**Interfaces:**
- Produces:
  - `applySpecPlaceholderEnv(env: NodeJS.ProcessEnv): void` in `spec-env.ts`. It sets placeholders only for keys that are unset, covering `BACKEND_JWT_SECRET`, `BACKEND_ENCRYPTION_SECRET`, `SMTP_HOST` and `SMTP_PORT`.
  - `createPreviewOpenApiDocument(): Promise<OpenAPIObject>` in `preview-document.ts`. It runs `NestFactory.create(AppModule, { preview: true, logger: ['error'] })`, then `setGlobalPrefix(API_PREFIX)`, then `createOpenApiDocument(app)`, then `app.close()`.
- `src/openapi.ts`:
  - Reads the output path from `process.argv[2]`. If it is missing, it prints a usage error and exits with code 1.
  - Calls `applySpecPlaceholderEnv(process.env)` **before** it dynamically imports `./openapi/preview-document.js`, because `ConfigModule` validates the env when `AppModule` is imported.
  - Creates the directory and writes `JSON.stringify(document)`.

- [ ] **Step 1: Write the failing unit tests** in `spec-env.spec.ts`:
  - `envSchema.safeParse` of an empty env after `applySpecPlaceholderEnv` succeeds. This pins Review Focus 3.
  - An already set `SMTP_HOST: 'smtp.real'` is left unchanged.
- [ ] **Step 2: Write the failing e2e test** in `test/openapi.e2e-spec.ts`: `it('generates the same document in preview mode as the booted app')` asserts `expect(await createPreviewOpenApiDocument()).toEqual(document)`. The plugin metadata is already loaded in `beforeAll`.
- [ ] **Step 3: Run both and verify they fail.**
  - Run: `pnpm --filter backend exec vitest run src/openapi/spec-env.spec.ts` and `pnpm --filter backend exec vitest run --config ./vitest.config.e2e.ts test/openapi.e2e-spec.ts`
  - Expected: FAIL, because the modules do not exist.
- [ ] **Step 4: Implement `spec-env.ts`, `preview-document.ts`, `openapi.ts`, `API_PREFIX` and the package.json version read.**
- [ ] **Step 5: Run the tests and verify they pass.**
  - Run: the same commands.
  - Expected: PASS.
- [ ] **Step 6: Smoke-test without infrastructure.**
  - Run `pnpm --filter backend build`.
  - Then, with the DB and Redis containers stopped or with `DB_HOST=203.0.113.1 REDIS_HOST=203.0.113.1`, run `node apps/backend/dist/openapi.js <scratch>/openapi.json`.
  - Expected: exit 0 in under a few seconds. The file is identical to the current `packages/api/assets/openapi.json`, including `info.version` `0.0.1`.

### Task 6: Build wiring (Turbo, api package, main.ts)

**Files:**
- Modify: `apps/backend/src/main.ts`:
  - Remove `--spec-only`, `saveOpenApiSpec` and the `NODE_ENV` branch.
  - Swagger UI setup and `listen` stay unchanged. Locking down `/docs` is a separate follow-up.
- Modify: `apps/backend/src/config/env.schema.ts` (remove `OPENAPI_PATH`)
- Modify: `apps/backend/package.json` (`"generate": "nest build && node dist/openapi.js ../../packages/api/assets/openapi.json"` for manual use)
- Modify: `packages/api/package.json`:
  - `devDependencies`: `"backend": "workspace:*"`.
  - `"build": "node node_modules/backend/dist/openapi.js assets/openapi.json && openapi-ts"`.
- Modify: `turbo.json`:
  - `build.outputs` gets `assets/openapi.json`.
  - Remove `assets/openapi.json` from `build.inputs`.
  - Remove the `generate` task, whose outputs point at non-existent paths.
- Modify: `packages/api/.gitignore` (remove the stale `src/openapi` entry; `assets/openapi.json` stays)
- Run: `pnpm install` (links `backend` into `packages/api/node_modules`)

**Interfaces:**
- Consumes: `apps/backend/dist/openapi.js <outPath>` (Task 5).

- [ ] **Step 1: Make the changes listed above, then run `pnpm install`.**
- [ ] **Step 2: Verify a clean build without infrastructure.**
  - Stop the dev containers, then delete `packages/api/assets/openapi.json`, `packages/api/dist` and `apps/backend/dist`.
  - Run: `pnpm build --force`
  - Expected: success. Turbo order is backend → api → frontend, and `packages/api/assets/openapi.json` exists afterwards.
- [ ] **Step 3: Verify caching.**
  - Run: `pnpm build` a second time.
  - Expected: all tasks `cache hit`.
  - Then change a backend DTO (e.g. add an `@ApiProperty` description) and run `pnpm build`. Expected: backend, api and frontend rebuild.
  - Revert the DTO change.
- [ ] **Step 4: Verify that the backend starts read-only.** Start `node apps/backend/dist/main.js` against the dev stack with no `NODE_ENV` set. Expected: the server starts and `packages/api/assets/openapi.json` is left untouched (same mtime).
- [ ] **Step 5: Run the full gate.**
  - Run: `pnpm typecheck && pnpm lint && pnpm test`
  - Expected: PASS. This needs the `.tmp` lint artefacts to be absent (known issue).

### Task 7: Dev watcher, frontend e2e, docs

**Files:**
- Modify: `packages/api/package.json`: `"dev": "chokidar \"node_modules/backend/dist/**/*.js\" --initial -d 1000 -c \"node node_modules/backend/dist/openapi.js assets/openapi.json && openapi-ts\""`
- Modify: `apps/frontend/e2e/support/global-setup.ts`:
  - Remove `OPENAPI_PATH` from the backend env.
  - Before starting the backend, run `node <backendWorkDir>/dist/openapi.js <generatedSpecPath>`.
  - In `syncApiClient`, replace `pnpm --filter api build` with `pnpm --filter api exec openapi-ts`, because `build` would read the possibly stale `apps/backend/dist`.
- Modify: `README.md` (the "OpenAPI spec and generated client" section: no DB needed any more, `pnpm build` does everything; `pnpm dev` regenerates on its own)
- Modify: `CLAUDE.md`:
  - The command list.
  - "The API contract pipeline", steps 2–3: the spec comes from `dist/openapi.js` in preview mode as part of `api#build`, and `main.ts` writes nothing.
  - The "After changing any endpoint" line: `pnpm build --filter api` instead of `generate` + `api build`.

- [ ] **Step 1: Make the changes listed above.**
- [ ] **Step 2: Check the dev loop.**
  - Run `pnpm dev`, then change a DTO field's description.
  - Expected: within a few seconds, `packages/api/dist` reflects the change. This works without a DB as well, even though the backend process itself then fails to boot.
  - Revert the DTO change.
- [ ] **Step 3: Run the frontend e2e suite.**
  - Run: `pnpm --filter frontend test:e2e`
  - Expected: PASS.
- [ ] **Step 4: Run `pnpm format:fix`, then the full gate (`pnpm check`).**
  - Expected: PASS.
