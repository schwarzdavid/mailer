# Operations and Robustness (Go-Live Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Phase 3 operations items from the go-live audit: health endpoints, hardened database, Redis and SMTP configuration, durable inbound-form deliveries, structured logging without personal data, and single-instance background jobs.

**Architecture:** All changes are backend-only plus deployment files. Configuration gains the missing knobs in the Zod `envSchema` and the existing factories. Inbound-form deliveries move from a fire-and-forget promise to a BullMQ queue on Redis, with the `inbound_form_delivery` row as the source of truth and a recovery sweep that re-enqueues stalled rows. Logging switches to `nestjs-pino`. Background jobs are guarded with `@nestjs/locks` over a Postgres lock store. Health endpoints come from `@nestjs/terminus` with custom Redis and SMTP indicators.

**Tech Stack:** NestJS 12 (Express), Sequelize 6, `@nestjs/bullmq` 12 + `bullmq` 6 (ioredis 5), `nestjs-pino` 5 + `pino` 10 + `pino-http` 11 + `pino-pretty` 13, `@nestjs/locks` 0.0.4, `@nestjs/terminus` 12, nodemailer 9, Zod 4, Vitest, supertest, Docker Compose smoke test.

**Spec:** The Phase 3 list from the go-live audit (items 18–24, memory `go-live-readiness-status`), with the owner's rulings from 2026-10-22 and the calls made in this plan:

| #   | Audit item                                                 | Ruling                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18  | Health and readiness endpoint with DB, Redis, SMTP checks  | _Plan call:_ `GET /api/health` (liveness: database only) and `GET /api/health/ready` (database, Redis, SMTP), both public, unthrottled, excluded from the OpenAPI document and from request logging. The compose healthcheck moves to `/api/health`.                                   |
| 19  | DB: SSL option, pool size, no SQL logging, mandatory creds | As stated. _Plan call:_ env keys `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_POOL_MAX`; `DB_PORT` defaults to `5432`.                                                                                                                                                                  |
| 20  | Redis: password, ACL and TLS                               | As stated for every Redis client (cache, throttler, queue). _Plan call:_ env keys `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS`, `REDIS_TLS_SERVERNAME`. The compose Redis stays unauthenticated on the internal network but gets `appendonly` and `noeviction`, which BullMQ needs. |
| 21  | Durable deliveries                                         | **BullMQ on Redis** (owner, 2026-10-22). The DB row stays the source of truth; a recovery sweep re-enqueues stalled `pending` rows; retries with exponential backoff on transient SMTP errors.                                                                                         |
| 22  | SMTP timeouts, `requireTLS`, pooling; `/v1/send` is sync   | **`/v1/send` stays synchronous** (owner, 2026-10-22): the API contract keeps `mailMessageId`. The transporter gets timeouts, pooling and `SMTP_REQUIRE_TLS` (default `true`).                                                                                                          |
| 23  | Structured logging (pino), request ids, no personal data   | **JSON in production, `pino-pretty` elsewhere** (owner, 2026-10-22). _Plan call:_ the backend generates a UUID per request, returns it as `X-Request-Id`, logs neither query strings, bodies nor `Authorization`/`Cookie` headers, and log lines name ids instead of e-mail addresses. |
| 24  | Multiple instances: DNS check and purge run everywhere     | **`@nestjs/locks`** (owner, 2026-10-22) with a Postgres lock store on Sequelize. `@OnOneInstance` + `@WithoutOverlapping` on the DNS check, the project purge and the new delivery recovery sweep. The bounce poller keeps its existing advisory lock (out of scope).                  |

## Global Constraints

- **Never touch git** (CLAUDE.md). The "commit" step of every task is replaced by: leave the changes in the working tree and report the files touched.
- **No code comments** (CLAUDE.md). Config files (JSON, YAML, Caddyfile) stay comment-free too (memory `no-comments-in-config-files`).
- **New dependencies (`apps/backend` only):** `@nestjs/bullmq@^12.0.0`, `bullmq@^6.4.0`, `nestjs-pino@^5.3.1`, `pino@^10.4.0`, `pino-http@^11.0.0`, `@nestjs/locks@0.0.4` (exact pin: pre-1.0), `@nestjs/terminus@^12.1.0`; dev: `pino-pretty@^13.2.0`. `ioredis` is already a dependency and is BullMQ's optional peer. Add with `pnpm --filter backend add …`; if pnpm reports "No matching version found", clear its metadata cache per memory `pnpm-stale-metadata-cache`.
- **Env keys** are the single home of defaults in `apps/backend/src/config/env.schema.ts`; every new key is documented in `.env.example` and the README in the same task. Read values via `ConfigService<Env, true>` + `get(key, { infer: true })`.
- **ESM:** relative imports with `.js`, `Relation<…>` for singular circular associations.
- **Migrations** are `src/migrations/NNN-*.ts` with `up`/`down` over `QueryInterface`, no own transactions. Next free numbers: `019`, `020`.
- **Test doubles:** typed per CLAUDE.md "Type-safe test doubles": `vi.fn<Collaborator['method']>()`, no `as` casts, domain types for fixtures.
- **Formatting:** after editing, `pnpm format:fix`; no hand-formatting.
- **Each task's gate:** `pnpm --filter backend typecheck`, `pnpm --filter backend lint` and the touched specs. E2E (`pnpm --filter backend test:e2e`, needs Docker) runs in the tasks that change e2e files. The last task runs the full gate, the image build and the smoke test.
- **Unit-spec env fixtures:** `requiredEnv` objects that reach `envSchema.parse` exist in `env.schema.spec.ts`, `app.setup.spec.ts`, `sequelize-options.spec.ts`, `static-frontend.spec.ts` and `mail.module.spec.ts`. Task 1 makes `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` required, so each fixture gains them in Task 1.

## Review Focus

1. **Backend starts before the mail server is healthy** (the compose `mail` service restarts until Caddy has the certificate). With a pooled transporter, `requireTLS` and timeouts, the backend must still boot, `/api/health` must be 200 while `/api/health/ready` is 503 with `smtp` down, and deliveries queued meanwhile must be sent once `mail` is up, without operator action. _Pinned in Task 7's smoke checks and Task 5's retry unit tests._
2. **The process dies between the SMTP `250 OK` and the row update.** BullMQ hands the stalled job to the next worker, which sends the mail a second time. The plan accepts the duplicate (the alternative, marking the row before sending, loses mails instead). The delivery must end `sent` with the second attempt's `mailMessageId`, never stay `pending`. _Pinned in Task 5: `deliver` is idempotent on a row that is no longer `pending`, and the recovery e2e._
3. **`?key=` in request logs.** pino-http's default `req` serializer logs the full URL including the query string, which would put API keys into our own logs (Phase 2 ruling #17). _Pinned in Task 4's serializer unit test and the existing smoke check "query-string API keys never reach the container logs"._
4. **Redis is now a hard dependency for deliveries.** Before, a Redis outage only disabled rate limiting and the cache; now `queue.add` throws and the submission must not be lost: the row is committed first, the enqueue failure is logged, the request still answers `201`, and the recovery sweep enqueues the row when Redis is back. _Pinned in Task 5's submission service spec._
5. **A delivery whose receiver or template was deleted while the job waited** (`SET NULL` foreign keys). The worker must mark the row `failed` with a reason and not retry. _Pinned in Task 5's delivery service spec._

---

### Task 1: Database configuration (#19)

**Files:**

- Modify: `apps/backend/src/config/env.schema.ts` (`DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, new `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_POOL_MAX`; `migrationEnvSchema` gains the three new keys)
- Modify: `apps/backend/src/factories/database.config.ts` (`createSequelizeOptions`)
- Modify: `apps/backend/src/config/env.schema.spec.ts`, `apps/backend/src/factories/sequelize-options.spec.ts`
- Modify (fixtures): `apps/backend/src/factories/app.setup.spec.ts`, `apps/backend/src/factories/static-frontend.spec.ts`, `apps/backend/src/modules/mail/mail.module.spec.ts`
- Modify: `apps/backend/src/openapi/spec-env.ts` (placeholders `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` = `openapi-spec-placeholder`)
- Modify: `.env.example` (add `DB_SSL=false`, `DB_POOL_MAX=10`), `README.md` (local setup step 2 and the production section: the new keys, `NODE_EXTRA_CA_CERTS` for a private CA)

**Interfaces:**

- Produces: `Env` gains `DB_SSL: boolean`, `DB_SSL_REJECT_UNAUTHORIZED: boolean`, `DB_POOL_MAX: number`; `DB_PORT: number` (default 5432); `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` are `string` (min 1).
- Produces: `createSequelizeOptions` returns `logging: false`, `pool: { max: DB_POOL_MAX, min: 0, acquire: 30_000, idle: 10_000 }`, and `dialectOptions: { ssl: { rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED } }` only when `DB_SSL` is true (no `dialectOptions` key otherwise).

- [ ] **Step 1: Write the failing tests.** In `env.schema.spec.ts`:

```ts
it.each(['DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'])('requires %s', (key) => {
    const { [key]: _omitted, ...env } = requiredEnv
    const result = envSchema.safeParse(env)
    expect(result.success).toBe(false)
    expect(result.error?.issues).toContainEqual(expect.objectContaining({ path: [key] }))
})

it('defaults the database port, ssl and pool size', () => {
    expect(envSchema.parse(requiredEnv)).toMatchObject({
        DB_PORT: 5432,
        DB_SSL: false,
        DB_SSL_REJECT_UNAUTHORIZED: true,
        DB_POOL_MAX: 10,
    })
})

it('requires the database credentials for migrations too', () => {
    expect(migrationEnvSchema.safeParse({ BACKEND_ENCRYPTION_SECRET: minimalSecret }).success).toBe(false)
})
```

In `sequelize-options.spec.ts`: extend the `toEqual` of "connects to Postgres with the validated credentials" with `logging: false` and `pool: { max: 10, min: 0, acquire: 30_000, idle: 10_000 }`, and add:

```ts
it('never logs SQL statements', () => {
    expect(createSequelizeOptions(configFor({})).logging).toBe(false)
})

it('enables TLS with certificate verification when DB_SSL is set', () => {
    expect(createSequelizeOptions(configFor({ DB_SSL: 'true' })).dialectOptions).toEqual({
        ssl: { rejectUnauthorized: true },
    })
})

it('can skip certificate verification for self-signed database servers', () => {
    expect(
        createSequelizeOptions(configFor({ DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'false' })).dialectOptions,
    ).toEqual({ ssl: { rejectUnauthorized: false } })
})

it('sets no dialect options without DB_SSL', () => {
    expect(createSequelizeOptions(configFor({}))).not.toHaveProperty('dialectOptions')
})

it('sizes the pool from DB_POOL_MAX', () => {
    expect(createSequelizeOptions(configFor({ DB_POOL_MAX: '3' })).pool).toEqual({
        max: 3,
        min: 0,
        acquire: 30_000,
        idle: 10_000,
    })
})
```

Add `DB_USERNAME: 'mailer'`, `DB_PASSWORD: 'secret'`, `DB_DATABASE: 'mailer'` to every `requiredEnv` fixture listed above.

- [ ] **Step 2: Run** `pnpm --filter backend exec vitest run src/config/env.schema.spec.ts src/factories/sequelize-options.spec.ts`. Expected: the new tests FAIL (credentials still optional, `logging` undefined).

- [ ] **Step 3: Implement.** In `env.schema.ts`: `DB_PORT: port.default(5432)`, the three credentials `z.string().min(1)`, `DB_SSL: z.stringbool().default(false)`, `DB_SSL_REJECT_UNAUTHORIZED: z.stringbool().default(true)`, `DB_POOL_MAX: z.coerce.number().int().positive().default(10)`; add the three new keys to `migrationEnvSchema`. In `database.config.ts` build the options per the Interfaces block. In `spec-env.ts` add the three placeholders.

- [ ] **Step 4: Run** the two spec files plus `app.setup.spec.ts`, `static-frontend.spec.ts`, `mail.module.spec.ts`. Expected: PASS. Then `pnpm --filter backend typecheck && pnpm --filter backend lint`.

- [ ] **Step 5: Docs.** `.env.example` and README as listed. README production section: the compose stack keeps `DB_SSL` unset; managed Postgres needs `DB_SSL=true` and, for a private CA, the CA file via `NODE_EXTRA_CA_CERTS` in `.env` (the Node runtime reads it) or `DB_SSL_REJECT_UNAUTHORIZED=false` as a last resort.

- [ ] **Step 6: No commit.** Report touched files.

---

### Task 2: Redis authentication and TLS (#20)

**Files:**

- Modify: `apps/backend/src/config/env.schema.ts` (`REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS`, `REDIS_TLS_SERVERNAME`)
- Modify: `apps/backend/src/factories/redis.options.ts`
- Create: `apps/backend/src/factories/redis.options.spec.ts`
- Modify: `apps/backend/src/modules/throttler-storage/throttler-storage.module.ts:17-28` (use `createIoRedisOptions`)
- Modify: `apps/backend/src/config/env.schema.spec.ts`
- Modify: `deploy/compose.yml` (`redis` service: `command: ['redis-server', '--appendonly', 'yes', '--maxmemory-policy', 'noeviction']`)
- Modify: `.env.example` (`REDIS_USERNAME=`, `REDIS_PASSWORD=`, `REDIS_TLS=false`, `REDIS_TLS_SERVERNAME=`), `README.md`

**Interfaces:**

- Produces: `Env` gains `REDIS_USERNAME?: string`, `REDIS_PASSWORD?: string`, `REDIS_TLS: boolean` (default false), `REDIS_TLS_SERVERNAME?: string` (`.optional()` strings; empty strings become `undefined` via `.transform`).
- Produces in `redis.options.ts`:
    - `createRedisClientOptions(configService): RedisClientOptions` (existing, for `@redis/client` / keyv): URL `redis://` or `rediss://` + `host:port/0`, `username`/`password` as top-level options when set, `socket.tls: true` and `socket.servername` when `REDIS_TLS`.
    - `createIoRedisOptions(configService): RedisOptions` (from `ioredis`): `{ host, port, db: 0, username?, password?, tls?: { servername? } }` and nothing else. Callers spread it and add their own `connectTimeout`, `retryStrategy`, `enableOfflineQueue`, `maxRetriesPerRequest`, `keyPrefix`.

- [ ] **Step 1: Write the failing tests** in the new `redis.options.spec.ts` (fixture `requiredEnv` as in `sequelize-options.spec.ts`, including the Task 1 DB keys):

```ts
it('builds a plain redis url without credentials by default', () => {
    expect(createRedisClientOptions(configFor({}))).toMatchObject({ url: 'redis://127.0.0.1:6379/0' })
    expect(createRedisClientOptions(configFor({}))).not.toHaveProperty('password')
})

it('passes username, password and tls to the node-redis client', () => {
    const options = createRedisClientOptions(
        configFor({
            REDIS_USERNAME: 'app',
            REDIS_PASSWORD: 's3cret',
            REDIS_TLS: 'true',
            REDIS_TLS_SERVERNAME: 'redis.internal',
        }),
    )
    expect(options).toMatchObject({
        url: 'rediss://127.0.0.1:6379/0',
        username: 'app',
        password: 's3cret',
        socket: { tls: true, servername: 'redis.internal' },
    })
})

it('builds ioredis options with only the connection fields', () => {
    expect(createIoRedisOptions(configFor({ REDIS_PASSWORD: 's3cret' }))).toEqual({
        host: '127.0.0.1',
        port: 6379,
        db: 0,
        password: 's3cret',
    })
})

it('enables tls for ioredis with the configured servername', () => {
    expect(createIoRedisOptions(configFor({ REDIS_TLS: 'true', REDIS_TLS_SERVERNAME: 'redis.internal' })).tls).toEqual({
        servername: 'redis.internal',
    })
})
```

In `env.schema.spec.ts`: `it('treats an empty REDIS_PASSWORD as unset')` → `expect(envSchema.parse({ ...requiredEnv, REDIS_PASSWORD: '' }).REDIS_PASSWORD).toBeUndefined()`.

- [ ] **Step 2: Run** `pnpm --filter backend exec vitest run src/factories/redis.options.spec.ts src/config/env.schema.spec.ts`. Expected: FAIL (`createIoRedisOptions` not exported).

- [ ] **Step 3: Implement** per the Interfaces block. For the optional strings use `z.string().optional().transform((value) => value || undefined)`. Replace the literal `host`/`port`/`db` in `throttler-storage.module.ts` with `...createIoRedisOptions(configService)`.

- [ ] **Step 4: Run** the two specs, `throttler-storage.service.spec.ts`, then typecheck and lint. Expected: PASS.

- [ ] **Step 5: Compose and docs.** Add the `command` to the `redis` service. README production section: Redis keeps AOF persistence because the delivery queue (Task 5) lives in it; the backend supports `REDIS_USERNAME`/`REDIS_PASSWORD`/`REDIS_TLS`/`REDIS_TLS_SERVERNAME` for a managed Redis, which must run with `maxmemory-policy noeviction`.

- [ ] **Step 6: No commit.** Report touched files.

---

### Task 3: SMTP transporter: timeouts, `requireTLS`, pooling, error classification (#22)

**Files:**

- Modify: `apps/backend/src/config/env.schema.ts` (`SMTP_REQUIRE_TLS: z.stringbool().default(true)`)
- Modify: `apps/backend/src/modules/mail/mail.module.ts` (transporter factory, new provider)
- Create: `apps/backend/src/modules/mail/services/mail-transporter-lifecycle.service.ts`
- Create: `apps/backend/src/modules/mail/helpers/smtp-error.ts`, `apps/backend/src/modules/mail/helpers/smtp-error.spec.ts`
- Modify: `apps/backend/src/modules/mail/exceptions/mail-send.error.ts` (`transient` flag)
- Modify: `apps/backend/src/modules/mail/mail.module.spec.ts`, `apps/backend/src/modules/mail/services/mail.service.spec.ts`
- Modify: `apps/backend/test/support/infrastructure.ts`, `apps/frontend/e2e/support/infrastructure.ts` (`SMTP_REQUIRE_TLS: 'false'`, MailHog has no STARTTLS; both `E2eEnv`/`BackendEnv` interfaces gain the key)
- Modify: `deploy/compose.yml` (`backend.environment.SMTP_REQUIRE_TLS: 'true'`), `.env.example` (`SMTP_REQUIRE_TLS=false`), `README.md`

**Interfaces:**

- Produces: transporter options `{ host, port, secure, requireTLS: SMTP_REQUIRE_TLS, pool: true, maxConnections: 5, maxMessages: 100, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000, dnsTimeout: 10_000, auth?, tls? }`.
- Produces: `MailTransporterLifecycle implements OnApplicationShutdown` with `onApplicationShutdown(): void` → `transporter.close()`.
- Produces: `isTransientSmtpError(error: unknown): boolean` in `helpers/smtp-error.ts`: `true` when the error has a numeric `responseCode` in 400–499, or no `responseCode` and a `code` in `ECONNECTION | ETIMEDOUT | ESOCKET | EDNS | ECONNRESET | ECONNREFUSED`; `false` for everything else (5xx, `EAUTH`, `EENVELOPE`, `EMESSAGE`, plain `Error`).
- Produces: `MailSendError` gains `readonly transient: boolean`, computed in its constructor as `isTransientSmtpError(cause)` (an `EmailBlockedException` cause is never transient).

- [ ] **Step 1: Write the failing tests.** `smtp-error.spec.ts`: one `it.each` over the table above (responseCode 421 → true, 450 → true, 550 → false, code `ECONNECTION` → true, code `EAUTH` → false, `new Error('x')` → false, `'string'` → false). `mail.module.spec.ts`: update both `toHaveBeenCalledWith` objects to the full option set with `requireTLS: true`, and add `it('can disable requireTLS for relays without STARTTLS')` with `SMTP_REQUIRE_TLS: 'false'`. `mail.service.spec.ts`: in "marks a transporter failure as failed", assert `error.transient` is `true` for a rejection with `responseCode: 421` and add a sibling asserting `false` for `responseCode: 550`; in "marks a blocked recipient…" assert `transient === false`.

- [ ] **Step 2: Run** `pnpm --filter backend exec vitest run src/modules/mail`. Expected: FAIL.

- [ ] **Step 3: Implement** per the Interfaces block. Register `MailTransporterLifecycle` as a provider in `MailModule` (it injects `MAIL_TRANSPORTER`).

- [ ] **Step 4: Run** `pnpm --filter backend exec vitest run src/modules/mail`, typecheck, lint. Expected: PASS.

- [ ] **Step 5: Env and docs.** Add `SMTP_REQUIRE_TLS: 'false'` to both e2e infrastructures, `SMTP_REQUIRE_TLS=false` to `.env.example` (MailHog), `SMTP_REQUIRE_TLS: 'true'` to the compose backend environment. README: the key, and that `/api/v1/send` waits for the relay with these timeouts and reports `DELIVERY_FAILED` on a failure; callers retry themselves.

- [ ] **Step 6: Run** `pnpm --filter backend test:e2e`. Expected: PASS (MailHog deliveries still work with `requireTLS: false`).

- [ ] **Step 7: No commit.** Report touched files.

---

### Task 4: Structured logging with pino (#23)

**Files:**

- Create: `apps/backend/src/factories/logger.options.ts`, `apps/backend/src/factories/logger.options.spec.ts`
- Modify: `apps/backend/src/config/env.schema.ts` (`LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')`)
- Modify: `apps/backend/src/app.module.ts` (`LoggerModule.forRootAsync` from `nestjs-pino`, first import)
- Modify: `apps/backend/src/main.ts` (`bufferLogs: true`, `app.useLogger(app.get(Logger))` from `nestjs-pino` right after `NestFactory.create`, before the migration run)
- Modify: `apps/backend/src/factories/umzug.factory.ts:78` (`logger` option: a Nest `Logger('Migrations')` adapter instead of `console`)
- Modify: `apps/backend/src/openapi/preview-document.ts`, `apps/backend/test/support/app.ts` (keep `logger: ['error']`; nothing else)
- Modify (log lines without e-mail addresses):
    - `apps/backend/src/modules/mail/services/mail.service.ts:131` → `Sent mail message ${mailMessageId}` (pass the id into `deliver`)
    - `apps/backend/src/modules/mail/services/mail.service.ts:159` → `Failed to record rejection bounce for mail message ${mailMessageId}: …`
    - `apps/backend/src/modules/bounce/services/bounce.service.ts:25,31` → use the bounce row id / `${bounce.type} bounce #${bounceId}`; the duplicate line names `bounce.messageId` only
    - `apps/backend/src/modules/bounce/services/email-block.service.ts:32,64` → `Blocked email block #${emailBlockId} until …`, `Unblocked email block #${row.emailBlockId}`
    - `apps/backend/src/modules/auth/strategies/local.strategy.ts:21` → `this.logger.warn('Login failed')` (the error carries the e-mail and reveals nothing an operator needs; keep the thrown 401)
- Modify: `apps/backend/test/bootstrap.e2e-spec.ts` (new `X-Request-Id` test), `apps/backend/test/support/infrastructure.ts` (`LOG_LEVEL: 'warn'`; `E2eEnv` gains the key)
- Modify: `deploy/smoke-test.sh` (new check after "GET /api/setup/status returns JSON"), `.env.example` (`LOG_LEVEL=debug`), `README.md`, `apps/backend/package.json` (deps)

**Interfaces:**

- Produces: `createLoggerOptions(configService: ConfigService<Env, true>): Params` (the `nestjs-pino` `Params` type) returning `{ pinoHttp: { level: LOG_LEVEL, transport: NODE_ENV === 'production' ? undefined : { target: 'pino-pretty', options: { singleLine: true } }, genReqId, customAttributeKeys: { reqId: 'reqId' }, autoLogging: { ignore }, serializers: { req: serializeRequest }, redact: ['req.headers.authorization', 'req.headers.cookie'] } }`.
- Produces (exported for tests): `genReqId(_req, res): string` (`randomUUID()`, and `res.setHeader('X-Request-Id', id)`), `serializeRequest(req): { id, method, url (path without query string), remoteAddress }`, `isUnloggedRequest(req): boolean` (`true` for `/api/health` and `/api/health/ready`).
- Produces: `createMigrationLogger(): UmzugOptions['logger']` in `umzug.factory.ts` mapping `info`/`warn`/`error`/`debug` to a `Logger('Migrations')`, so `createUmzug` logs through whatever logger the app installed.

- [ ] **Step 1: Write the failing tests** in `logger.options.spec.ts`:

```ts
it('logs json at LOG_LEVEL in production', () => {
    const { pinoHttp } = createLoggerOptions(configFor({ NODE_ENV: 'production', LOG_LEVEL: 'warn' }))
    expect(pinoHttp).toMatchObject({ level: 'warn' })
    expect(pinoHttp).not.toHaveProperty('transport')
})

it('pretty-prints outside production', () => {
    expect(createLoggerOptions(configFor({})).pinoHttp).toMatchObject({ transport: { target: 'pino-pretty' } })
})

it('strips the query string from the logged url', () => {
    expect(serializeRequest(requestLike({ method: 'GET', url: '/api/v1/send?key=sdm_secret', id: 'r1' })).url).toBe(
        '/api/v1/send',
    )
})

it('never serializes headers or the body', () => {
    expect(Object.keys(serializeRequest(requestLike({ url: '/api/x' })))).toEqual([
        'id',
        'method',
        'url',
        'remoteAddress',
    ])
})

it('redacts authorization and cookie headers', () => {
    expect(createLoggerOptions(configFor({})).pinoHttp).toMatchObject({
        redact: ['req.headers.authorization', 'req.headers.cookie'],
    })
})

it('does not auto-log health probes', () => {
    expect(isUnloggedRequest(requestLike({ url: '/api/health' }))).toBe(true)
    expect(isUnloggedRequest(requestLike({ url: '/api/health/ready' }))).toBe(true)
    expect(isUnloggedRequest(requestLike({ url: '/api/healthz' }))).toBe(false)
})

it('generates a uuid request id and exposes it on the response', () => {
    const setHeader = vi.fn<ServerResponse['setHeader']>()
    const id = genReqId(requestLike({}), responseLike({ setHeader }))
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', id)
})
```

`requestLike`/`responseLike` are typed helpers in the spec returning `Pick<IncomingMessage, …>` shapes the functions accept (type the function parameters as those `Pick`s, not as full `IncomingMessage`).

In `bootstrap.e2e-spec.ts`: `it('answers every request with an X-Request-Id')` → `GET /api/setup/status`, expect header matching the UUID regex, and two requests get different ids.

- [ ] **Step 2: Run** `pnpm --filter backend exec vitest run src/factories/logger.options.spec.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Install** the dependencies (Global Constraints) and implement `logger.options.ts`, the `app.module.ts` import, `main.ts` and the umzug logger adapter. In `main.ts` the order is: create (with `bufferLogs: true`) → `useLogger` → migrations → `configureApp` → listen.

- [ ] **Step 4: Rewrite the log lines** listed under Files. Update the specs that assert on those messages (`mail.service.spec.ts`, `bounce.service.spec.ts`, `email-block.service.spec.ts` if they do; grep for the old text).

- [ ] **Step 5: Run** `pnpm --filter backend test`, typecheck, lint. Expected: PASS.

- [ ] **Step 6: Verify the dev loop by hand** (memory `dev-loop-issues-are-blockers`): `pnpm --filter backend dev` prints pretty, single-line logs including the `Setup token:` line and the migration lines; stop it. Then `NODE_ENV=production` is not testable locally without the SPA, so the JSON path is pinned by the smoke check below.

- [ ] **Step 7: Smoke check.** After "GET /api/setup/status returns JSON": `dc logs --no-color backend` must contain a line matching `^\{"level":[0-9]+,.*"reqId":"[0-9a-f-]{36}".*"url":"/api/setup/status"` (`grep -Eq`); `pass "the backend writes json request logs with request ids"`, else `fail`. Also assert the `X-Request-Id` response header on the `/api/setup/status` request via `$tmp/headers`.

- [ ] **Step 8: E2E.** Add `LOG_LEVEL: 'warn'` to the backend e2e env and run `pnpm --filter backend test:e2e`. Expected: PASS, including the new bootstrap test. Playwright keeps the default level: its global setup reads `Setup token: …` from `backend.log`, which the pretty output still contains on one line (`singleLine: true`); run `pnpm --filter frontend test:e2e` to prove it.

- [ ] **Step 9: Docs.** README: log format, `LOG_LEVEL`, `X-Request-Id`, that logs carry ids instead of addresses and never query strings, headers or bodies. `.env.example`: `LOG_LEVEL=debug`.

- [ ] **Step 10: No commit.** Report touched files.

---

### Task 5: Durable inbound-form deliveries on BullMQ (#21)

**Files:**

- Create: `apps/backend/src/migrations/019-add-delivery-attempts.ts` (`ALTER TABLE "inbound_form_delivery" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0`; down drops it)
- Modify: `apps/backend/src/modules/inbound-form/models/inbound-form-delivery.model.ts`, `interfaces/inbound-form-delivery.interface.ts` (`attempts: number`)
- Create: `apps/backend/src/modules/inbound-form/inbound-form.constants.ts`
- Create: `apps/backend/src/modules/inbound-form/services/inbound-form-delivery-queue.service.ts` + `.spec.ts`
- Create: `apps/backend/src/modules/inbound-form/services/inbound-form-delivery.service.ts` + `.spec.ts`
- Create: `apps/backend/src/modules/inbound-form/services/inbound-form-delivery-recovery.service.ts` + `.spec.ts`
- Create: `apps/backend/src/modules/inbound-form/processors/inbound-form-delivery.processor.ts` + `.spec.ts`
- Modify: `apps/backend/src/modules/inbound-form/services/inbound-form-submission.service.ts` (drop `processDeliveries`, `processDelivery`, `resolveAddress`, the `MailService` and `TemplateRendererService` dependencies; enqueue after the transaction) + `.spec.ts`
- Modify: `apps/backend/src/modules/inbound-form/inbound-form.module.ts` (`BullModule.registerQueue({ name: INBOUND_FORM_DELIVERY_QUEUE })`, new providers)
- Modify: `apps/backend/src/app.module.ts` (`BullModule.forRootAsync` with `connection: { ...createIoRedisOptions(configService), maxRetriesPerRequest: null }`)
- Modify: `apps/backend/test/inbound-form-management.e2e-spec.ts` (new recovery test), `apps/backend/test/support/throttle-reset.ts` or a new `queue-reset.ts` setup file (obliterate the queue between files)
- Modify: `README.md`, `CLAUDE.md` (architecture paragraph), `apps/backend/package.json`

**Interfaces:**

- Constants (`inbound-form.constants.ts`): `INBOUND_FORM_DELIVERY_QUEUE = 'inbound-form-delivery'`, `DELIVERY_JOB = 'deliver'`, `DELIVERY_MAX_ATTEMPTS = 8`, `DELIVERY_BACKOFF_MS = 60_000`, `DELIVERY_WORKER_CONCURRENCY = 5`, `DELIVERY_RECOVERY_INTERVAL_MS = 60_000`, `DELIVERY_STALLED_AFTER_MS = 2 * 60_000`.
- `interface DeliveryJobData { inboundFormDeliveryId: number }` (in the queue service file, exported).
- `InboundFormDeliveryQueueService.enqueue(inboundFormDeliveryId: number): Promise<void>` → `queue.add(DELIVERY_JOB, { inboundFormDeliveryId }, { jobId: \`delivery-${id}\`, attempts: DELIVERY_MAX_ATTEMPTS, backoff: { type: 'exponential', delay: DELIVERY_BACKOFF_MS }, removeOnComplete: true, removeOnFail: true })`. Injects `@InjectQueue(INBOUND_FORM_DELIVERY_QUEUE) queue: Queue<DeliveryJobData>`.
- `InboundFormDeliveryService.deliver(inboundFormDeliveryId: number, isLastAttempt: boolean): Promise<void>`:
    - Loads the row with `submission` (for `data` and `inboundFormId` → form `projectId`), `receiver`, `template`. Missing row or `status !== 'pending'` → return.
    - Permanent failure (receiver or template `null`, empty placeholder recipient, `MailSendError` with `transient === false`, any non-`MailSendError` error from rendering) → `update({ status: FAILED, error, attempts: attempts + 1, mailMessageId: error instanceof MailSendError ? error.mailMessageId : null })`, return normally.
    - Transient failure (`MailSendError.transient`) → `update({ error, attempts: attempts + 1, mailMessageId, status: isLastAttempt ? FAILED : PENDING })`, then rethrow so BullMQ schedules the retry (or records the final failure).
    - Success → `update({ status: SENT, emailTo, sentAt: new Date(), mailMessageId, attempts: attempts + 1, error: null })`.
    - Moves `resolveAddress` here unchanged.
- `InboundFormDeliveryProcessor extends WorkerHost` (`@Processor(INBOUND_FORM_DELIVERY_QUEUE, { concurrency: DELIVERY_WORKER_CONCURRENCY })`): `process(job: Job<DeliveryJobData>): Promise<void>` → `deliveryService.deliver(job.data.inboundFormDeliveryId, job.attemptsMade + 1 >= (job.opts.attempts ?? 1))`.
- `InboundFormDeliveryRecoveryService`: `@Interval(DELIVERY_RECOVERY_INTERVAL_MS) handleRecoveryInterval(): Promise<void>` (logs errors, never throws) and `recoverStalled(): Promise<number>`: `findAll({ where: { status: PENDING, updatedAt: { [Op.lt]: new Date(Date.now() - DELIVERY_STALLED_AFTER_MS) } }, attributes: ['inboundFormDeliveryId'] })`, enqueues each (the `jobId` makes a re-add of a live job a no-op), returns the count. Task 6 adds the lock decorators.
- `InboundFormSubmissionService.submitForm`: after the transaction commits, `for` each created delivery `await this.deliveryQueueService.enqueue(id)` inside `try/catch` that logs `Enqueuing delivery ${id} failed: …` and continues; the request still resolves.

- [ ] **Step 1: Write the failing unit tests.**
    - `inbound-form-delivery-queue.service.spec.ts`: `enqueue(7)` calls `queue.add` with exactly the options in the Interfaces block (`jobId: 'delivery-7'`).
    - `inbound-form-delivery.service.spec.ts` (mock `InboundFormDeliveryModel.findByPk`/`findOne`, `MailService`, `TemplateRendererService`): sends and marks `sent` with `mailMessageId`, `sentAt`, `attempts: 1`; returns without sending when the row is `sent` already; marks `failed` without rethrow when the receiver is `null` (error `Receiver was deleted`), when the template is `null` (`Template was deleted`), when the placeholder recipient is empty, and when `MailSendError.transient` is `false`; on a transient `MailSendError` with `isLastAttempt=false` keeps `pending`, stores `error` and `attempts`, and rethrows; with `isLastAttempt=true` marks `failed` and rethrows; renders the subject without html escaping (move that existing assertion from the submission spec).
    - `inbound-form-delivery.processor.spec.ts`: `process` passes `(id, false)` for `attemptsMade: 0, opts.attempts: 8` and `(id, true)` for `attemptsMade: 7`.
    - `inbound-form-delivery-recovery.service.spec.ts`: enqueues every stalled id, returns the count, `handleRecoveryInterval` logs and swallows an enqueue error.
    - `inbound-form-submission.service.spec.ts`: replace the delivery-processing tests (lines 287–430 and 560–630: "sends one mail per receiver", "links a failed delivery…", "marks a delivery failed…", "resolves before the mail transport…", "logs instead of crashing…", "keeps processing…", "renders the subject…") with: creates one `pending` delivery per active receiver with a published template and enqueues each id after the transaction; "logs and still accepts the submission when enqueueing fails" (Review Focus 4); "enqueues nothing when persisting the submission fails".

- [ ] **Step 2: Run** `pnpm --filter backend exec vitest run src/modules/inbound-form`. Expected: FAIL (modules missing).

- [ ] **Step 3: Install** `@nestjs/bullmq`, `bullmq`; write the migration, model/interface change, constants, services, processor, module wiring and the `BullModule.forRootAsync` in `app.module.ts`. Delivery row loading: `deliveryModel.findByPk(id, { include: [{ model: InboundFormSubmissionModel, include: [InboundFormModel] }, InboundFormReceiverModel, InboundFormTemplateModel] })`; `projectId` comes from `submission.form.projectId` (check the association names in the models and use the existing ones).

- [ ] **Step 4: Run** the unit specs, typecheck, lint. Expected: PASS.

- [ ] **Step 5: E2E.** Add a setup file `apps/backend/test/support/queue-reset.ts` (registered after `throttle-reset.ts` in `vitest.config.e2e.ts`) that builds `connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) }` (`env.ts` has already copied the container settings into `process.env`), runs `await new Queue(INBOUND_FORM_DELIVERY_QUEUE, { connection }).obliterate({ force: true })` and closes the queue, so a delayed retry from one file cannot run in the next. (`receiverModel()`/`templateModel()` in the test below are `app.get(getModelToken(...))` helpers like the existing `deliveryModel()`; the published-template flag is whatever column `InboundFormTemplateService.getPublished` filters on.) In `inbound-form-management.e2e-spec.ts` add under "public submission delivery":

```ts
it('recovers a pending delivery that never reached the queue', async () => {
    const submission = await submissionModel().create({
        inboundFormId: formId,
        data: { name: 'Lost', email: 'lost@ifm-submitter.test' },
        status: InboundFormSubmissionStatus.ACCEPTED,
    })
    const ownerReceiver = await receiverModel().findOne({
        where: { inboundFormId: formId, emailReceiver: ownerAddress },
        rejectOnEmpty: true,
    })
    const ownerTemplate = await templateModel().findOne({
        where: { inboundFormReceiverId: ownerReceiver.inboundFormReceiverId, isPublished: true },
        rejectOnEmpty: true,
    })
    const delivery = await deliveryModel().create({
        inboundFormSubmissionId: submission.inboundFormSubmissionId,
        inboundFormReceiverId: ownerReceiver.inboundFormReceiverId,
        inboundFormTemplateId: ownerTemplate.inboundFormTemplateId,
        emailFrom: ownerReceiver.emailFrom,
        emailTo: ownerAddress,
        status: InboundFormDeliveryStatus.PENDING,
        attempts: 0,
        error: null,
        sentAt: null,
        mailMessageId: null,
    })
    await deliveryModel().update(
        { updatedAt: new Date(Date.now() - 3 * 60_000) },
        { where: { inboundFormDeliveryId: delivery.inboundFormDeliveryId }, silent: true },
    )

    expect(await app.get(InboundFormDeliveryRecoveryService).recoverStalled()).toBe(1)

    await vi.waitFor(async () => {
        const row = await deliveryModel().findByPk(delivery.inboundFormDeliveryId)
        expect(row?.status).toBe('sent')
        expect(row?.attempts).toBe(1)
    })
    expect((await waitForMessagesTo(mailhogUrl, ownerAddress)).length).toBeGreaterThan(0)
})
```

Run `pnpm --filter backend test:e2e`. Expected: PASS, including `schema.e2e-spec.ts` (the model and the migration agree on `attempts`) and the bounce suite (`latestDeliveryTo` already polls for `sent|failed`).

- [ ] **Step 6: Docs.** README (the inbound-form paragraph: deliveries are queued in Redis, retried 8 times over about two hours on temporary relay errors, recovered after a restart; Redis is therefore required for deliveries) and CLAUDE.md (Backend section: the queue, the worker runs in the same process, `recoverStalled`). Note the accepted duplicate from Review Focus 2 in the README.

- [ ] **Step 7: No commit.** Report touched files.

---

### Task 6: Single-instance jobs with `@nestjs/locks` (#24)

**Files:**

- Create: `apps/backend/src/migrations/020-create-locks.ts`
- Create: `apps/backend/src/modules/locks/locks.module.ts`, `apps/backend/src/modules/locks/stores/sequelize-lock.store.ts`
- Create: `apps/backend/test/lock-store.e2e-spec.ts`
- Modify: `apps/backend/src/app.module.ts` (import `AppLocksModule`)
- Modify: `apps/backend/src/modules/domain/services/dns-health.service.ts:18`, `apps/backend/src/modules/project/services/project-purge.service.ts:14`, `apps/backend/src/modules/inbound-form/services/inbound-form-delivery-recovery.service.ts` (decorators), their specs
- Modify: `README.md`, `CLAUDE.md`, `apps/backend/package.json`

**Interfaces:**

- Migration 020: table `locks` (`key VARCHAR(255) PRIMARY KEY`, `owner VARCHAR(255) NULL`, `fencing_token BIGINT NOT NULL DEFAULT 0`, `expires_at TIMESTAMPTZ NULL`) and `CREATE SEQUENCE locks_fencing_token_seq`; down drops both.
- `SequelizeLockStore implements LockStore` (from `@nestjs/locks`), registered as a provider in `AppLocksModule` (`@Module({ imports: [LocksModule.forRoot({ ttl: '30s' })], providers: [SequelizeLockStore] })`); its constructor injects `Sequelize` and `LocksStorage` and calls `storage.registerSource(this)`. Methods per the `LockStore` contract (`acquire(key, owner, ttl)`, `renew(key, owner, ttl)`, `release(key, owner)`), each a single statement via `sequelize.query` with replacements: acquire is `INSERT … ON CONFLICT ("key") DO UPDATE SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at, fencing_token = greatest(locks.fencing_token + 1, nextval('locks_fencing_token_seq')) WHERE locks.owner IS NULL OR locks.expires_at <= clock_timestamp() RETURNING fencing_token`; renew/release are `UPDATE … WHERE key = :key AND owner = :owner AND expires_at > clock_timestamp()` and return `rowCount === 1`. Tokens are returned as `Number(...)`.
- Lock keys: `domain:dns-check`, `project:purge`, `inbound-form:delivery-recovery`.

- [ ] **Step 1: Read the installed package first.** Install `@nestjs/locks@0.0.4` and read `node_modules/@nestjs/locks/README.md` and its `.d.ts` for the exact `LockStore` signatures, the `LocksStorage.registerSource` call, `lockStoreContract` from `@nestjs/locks/testing`, and how `@OnOneInstance`/`@WithoutOverlapping` obtain the `Locks` service at call time. If the decorated method cannot run on a bare instance (no module bootstrap), the unit specs below call the undecorated public methods (`checkAllDomains`, `purgeExpiredProjects`, `recoverStalled`) as they already do, and the decorated interval handlers are covered by the e2e app boot. Record what you found in the task report.

- [ ] **Step 2: Write the failing e2e** `lock-store.e2e-spec.ts`: boot `createTestApp()`, get `SequelizeLockStore`, and register every case of `lockStoreContract(() => store, { concurrent: true })` with `for (const c of cases) it(c.name, c.run)`. Add `it('stores monotonic fencing tokens across releases')`: acquire, release, acquire again → second token greater than the first.

- [ ] **Step 3: Run** `pnpm --filter backend exec vitest run --config ./vitest.config.e2e.ts test/lock-store.e2e-spec.ts`. Expected: FAIL (no store).

- [ ] **Step 4: Implement** migration, store, module; decorate the three interval handlers with `@OnOneInstance({ key })` and `@WithoutOverlapping()` (keep `@Interval` on the same method). Remove the `checkRunning` flag from `DnsHealthService` only if `@WithoutOverlapping` demonstrably covers direct calls too (Step 1); otherwise keep it.

- [ ] **Step 5: Run** the lock e2e, the three job unit specs, `migrations.e2e-spec.ts`, `schema.e2e-spec.ts` (the `locks` table has no model; confirm the schema suite ignores tables without models, otherwise exclude it there by name), typecheck, lint. Expected: PASS.

- [ ] **Step 6: Verify production boot.** `@nestjs/locks` refuses to start under `NODE_ENV=production` without a registered store. The smoke test (Task 8) proves the registration; nothing to do here beyond noting it.

- [ ] **Step 7: Docs.** README production section: several backend instances can share one database and Redis; the DNS check, purge and delivery recovery run on one instance at a time through the `locks` table, the bounce poller through its advisory lock. CLAUDE.md: the locks module and the rule that new interval jobs get the two decorators.

- [ ] **Step 8: No commit.** Report touched files and the Step 1 findings.

---

### Task 7: Health and readiness endpoints (#18)

**Files:**

- Create: `apps/backend/src/modules/health/health.module.ts`, `controller/health.controller.ts`, `indicators/redis-health.indicator.ts`, `indicators/smtp-health.indicator.ts`, `health.constants.ts`
- Create: `apps/backend/src/modules/health/indicators/redis-health.indicator.spec.ts`, `smtp-health.indicator.spec.ts`
- Create: `apps/backend/test/health.e2e-spec.ts`
- Modify: `apps/backend/src/app.module.ts` (import `HealthModule`)
- Modify: `deploy/compose.yml` (backend healthcheck URL → `/api/health`), `deploy/smoke-test.sh`, `README.md`, `apps/backend/package.json`

**Interfaces:**

- `HealthController` (`@Controller('health')`, `@Public()`, `@SkipThrottle()`, `@ApiExcludeController()`): `GET /api/health` → `health.check([() => sequelizeIndicator.pingCheck('database', { timeout: 3000 })])`; `GET /api/health/ready` → database + `redisIndicator.isHealthy('redis')` + `smtpIndicator.isHealthy('smtp')`. Terminus answers 200 `{ status: 'ok', info, error, details }` or 503 `{ status: 'error', … }`.
- `RedisHealthIndicator.isHealthy(key: string): Promise<HealthIndicatorResult>`: injects `THROTTLER_REDIS_CLIENT` (fails fast when disconnected) and `HealthIndicatorService`; `await client.ping()` within `HEALTH_TIMEOUT_MS = 3000` → `up()`, otherwise `down({ message })`.
- `SmtpHealthIndicator.isHealthy(key: string)`: injects `MAIL_TRANSPORTER`; `transporter.verify()` within `SMTP_HEALTH_TIMEOUT_MS = 5000` → `up()`, otherwise `down({ message })`.
- `HealthModule` imports `TerminusModule`, `ThrottlerStorageModule`, `MailModule`.

- [ ] **Step 1: Write the failing tests.** Indicator unit specs: `up` on resolved ping/verify, `down` with the error message on rejection, `down` with `Timed out after 3000 ms` when the promise never settles (use `vi.useFakeTimers`). `health.e2e-spec.ts`: `GET /api/health` → 200, body `status: 'ok'`, `info.database.status === 'up'`; `GET /api/health/ready` → 200 with `database`, `redis`, `smtp` all `up`; 15 sequential `GET /api/health` all 200 (the default throttler allows 10/min, so this proves `@SkipThrottle`); `GET /api/health` carries no `access-control-allow-origin`; the OpenAPI document from `createOpenApiDocument(app)` has no path starting with `/api/health`.

- [ ] **Step 2: Run** the health e2e. Expected: FAIL (404).

- [ ] **Step 3: Install** `@nestjs/terminus` and implement per the Interfaces block. `pingCheck` for Sequelize: `SequelizeHealthIndicator` from `@nestjs/terminus` with the connection from `getConnectionToken()` if its options require one.

- [ ] **Step 4: Run** the indicator specs, the health e2e, `bootstrap.e2e-spec.ts`, typecheck, lint. Expected: PASS.

- [ ] **Step 5: Compose and smoke test.** Healthcheck: `fetch('http://127.0.0.1:8000/api/health')…`. Smoke checks: in the "stack without mail" phase, `GET /api/health` → 200 and `GET /api/health/ready` → 503 whose body contains `"smtp"` (`pass "readiness reports the missing mail server while liveness stays up"`); after "mail is up and healthy", `GET /api/health/ready` → 200 (`pass "readiness is 200 once the mail server accepts connections"`). Use `request`, `expect_status`, `$tmp/body` as the other checks do; the readiness call may need a retry loop of up to 30 s after `mail` turns healthy because the transporter pool reconnects lazily.

- [ ] **Step 6: Docs.** README: both endpoints, what each checks, the status codes, that they are unauthenticated, unthrottled and not logged, and that `/api/health` is the Docker healthcheck.

- [ ] **Step 7: No commit.** Report touched files.

---

### Task 8: Full gate, smoke test and bookkeeping

**Files:**

- Modify: `CLAUDE.md` (env key list in the layout paragraph: `DB_SSL*`, `DB_POOL_MAX`, `REDIS_*`, `SMTP_REQUIRE_TLS`, `LOG_LEVEL`; the queue, locks, health and logging summaries if Tasks 4–7 did not already add them), memory `go-live-readiness-status.md` (Phase 3 done with the rulings table, the `@nestjs/locks` 0.0.4 pre-release risk, Redis as a hard dependency, the accepted duplicate-send window).
- Modify: `README.md` "Open todos" if any Phase 3 item is deliberately left (bounce poller on advisory lock).

- [ ] **Step 1: Run** `pnpm check`. Expected: lint, typecheck, test and format all green.
- [ ] **Step 2: Run** `pnpm --filter backend test:e2e` and `pnpm --filter frontend test:e2e`. Expected: PASS.
- [ ] **Step 3: Run** `docker build -t ghcr.io/schwarzdavid/mailer-backend:local .` and `IMAGE_TAG=local bash deploy/smoke-test.sh`. Expected: every check passes, including the new log, request-id, readiness/liveness checks, the migration checks (019 and 020 applied at boot) and the existing `?key=` log check. If the backend refuses to boot because `@nestjs/locks` finds no store under `NODE_ENV=production`, Task 6's registration is wrong; fix there.
- [ ] **Step 4: Update `CLAUDE.md` and the memory file** as listed above.
- [ ] **Step 5: Report** the touched files, the dev-loop observation from Task 4 Step 6, the Task 6 Step 1 findings and the smoke test output summary. No commit.
