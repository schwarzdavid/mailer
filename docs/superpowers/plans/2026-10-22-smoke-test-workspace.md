# Smoke Test Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `deploy/smoke-test.sh` with a Vitest suite in a new workspace `deploy` that runs the same 30 checks against the same throwaway production stack, one named test per former `pass` line.

**Architecture:** `deploy/` becomes a pnpm workspace with its own `package.json`, `tsconfig.json`, ESLint and two Vitest configs (unit tests of the pure helpers under `pnpm test`; the Docker suite under `pnpm test:smoke`). One spec file, `deploy/smoke/stack.smoke-spec.ts`, holds the suite as a `describe` per phase, in the order the Bash script runs them, with `bail: 1`. Helpers under `deploy/smoke/support/` wrap `docker compose` and `openssl` through `execa`, HTTP through `node:http`, and host-side SMTP through `nodemailer`. The two checks that must run inside the Docker network are TypeScript files under `deploy/smoke/container/`, piped into `node --input-type=module-typescript` in the backend container.

**Tech Stack:** Vitest 4, execa 10, nodemailer 9, `node:http`, the `openssl` and `docker` CLIs, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-22-smoke-test-workspace-design.md`. The Bash script `deploy/smoke-test.sh` stays in the tree until Task 8 and is the reference for every exact value (line numbers below refer to it as it is now).

## Global Constraints

- **Never touch git** (CLAUDE.md). Every "commit" step is: leave the changes in the working tree and report the files touched.
- **No code comments**, and config files (JSON, YAML) stay comment-free too (memory `no-comments-in-config-files`).
- **Workspace `deploy`:** `"type": "module"`, `nodenext` resolution, relative imports carry `.js` (`./support/http.js`). `tsconfig.json` sets `erasableSyntaxOnly` and `verbatimModuleSyntax`, so: no `enum`, no parameter properties, `import type` for types. Explicit class fields instead of `constructor(private …)`.
- **Dev dependencies of `deploy` (none at runtime):** `vitest@^4.1.9`, `@vitest/eslint-plugin@^1.6.20`, `eslint@^10.6.0`, `typescript-eslint@^8.62.0`, `globals@^17.7.0`, `typescript@^6.0.3`, `@types/node@^26.1.0`, `execa@^10.1.0`, `nodemailer@^9.0.3`, `@types/nodemailer@^8.0.1`. Add with `pnpm --filter deploy add -D …`; on "No matching version found" see memory `pnpm-stale-metadata-cache`.
- **Unchanged constants:** compose project `mailer-smoke`, mail hostname `mail.smoke.test`, ports 18080 (HTTP), 18443 (HTTPS), 18025 (SMTP), `SITE_ADDRESS=:80`, image `ghcr.io/schwarzdavid/mailer-backend`, `IMAGE_TAG` from the environment with default `local`.
- **Test names** are the former `pass` texts without their runtime interpolations (`$asset`, serials, HTTP codes); those values go into assertion messages, not names.
- **Docker CLI output** is stripped of `\r` (`replace(/\r/g, '')`) before any comparison.
- **Polling:** `expect.poll(fn, { interval, timeout })` with both options given explicitly; never a hand-rolled loop.
- **Timeouts:** `hookTimeout: 600_000`, `testTimeout: 300_000` in the smoke config.
- **Host requirements for `test:smoke`:** Docker with Compose 2.23.1+, `openssl` on `PATH` (on Windows run from Git Bash or add Git's `usr/bin` to `PATH`), the image built: `docker build -t ghcr.io/schwarzdavid/mailer-backend:local .` (once; rebuild only when the backend or Dockerfile changed).
- **Per-task gate:** `pnpm --filter deploy lint`, `pnpm --filter deploy typecheck`, `pnpm --filter deploy test`, then `pnpm format:fix`. Tasks 3–8 additionally run `IMAGE_TAG=local pnpm --filter deploy test:smoke` and the expected count of passed tests is stated in the task.
- **Formatting:** Prettier owns it (`pnpm format:fix`); 4-space indent, single quotes, no semicolons, trailing commas; `package.json` with 2 spaces.

## Review Focus

1. **A killed previous run** (Ctrl-C, a crashed terminal) leaves the `mailer-smoke` containers and volumes behind; the next run would then reuse a database that already has a user, and the setup-token test fails for the wrong reason. Expected: a run always starts from an empty project. _Pinned in Task 3: `createStack` runs `down -v --remove-orphans` before anything else, and step 8 runs the suite twice with the first run killed._
2. **The image tag is not built locally.** `up --pull missing` then asks GHCR, which answers with an authentication error that hides the cause. Expected: a message that names the build command. _Pinned in Task 3: `createStack` inspects the image first; step 9 runs with `IMAGE_TAG=does-not-exist`._
3. **A hanging phase** (mail never becomes healthy, a port is taken) must not leave the stack running. Expected: the test times out, the remaining tests are skipped, the stack is torn down. _Pinned in Task 3: `afterAll` calls `destroyStack`, which tolerates a stack that never started; step 9 covers the "beforeAll throws" path._
4. **Windows host.** Docker output can carry `\r`, the override compose file must use POSIX-relative bind mounts (`./tls`, `./ca`), and the temp dir must be under `os.tmpdir()` so Docker Desktop can share it. _Pinned in Task 3: `Compose.run` strips `\r`; every smoke gate in this plan runs on this Windows machine._
5. **The image's Node lacks TypeScript stdin support** (an image older than Node 23.6 would answer `--input-type=module-typescript` with an error). Expected: the test fails with the container's stderr, not with an empty assertion. _Pinned in Task 5: `execNode` rejects with stdout and stderr in the message (execa's default), and the submission test asserts on the printed lines._

---

### Task 1: Workspace scaffold and the HTTP helper

**Files:**

- Modify: `pnpm-workspace.yaml` (the `packages` list gains `- 'deploy'`)
- Modify: `eslint.config.ts` (root; the first `ignores` entry becomes `['apps/**', 'packages/**', 'deploy/**']`)
- Create: `deploy/package.json`, `deploy/tsconfig.json`, `deploy/eslint.config.ts`, `deploy/vitest.config.ts`, `deploy/vitest.config.smoke.ts`
- Create: `deploy/smoke/support/http.ts`
- Test: `deploy/smoke/support/http.spec.ts`

**Interfaces:**

- Produces (`deploy/smoke/support/http.ts`):

```ts
export interface HttpResponse {
    status: number
    headers: Record<string, string>
    body: string
}
export interface RequestOptions {
    headers?: Record<string, string>
    body?: string
}
export function request(url: string, method?: string, options?: RequestOptions): Promise<HttpResponse>
export function statusOf(url: string): Promise<number | undefined>
```

`request` uses `node:http` (`http.request`), follows no redirects, decodes nothing, collects the body as UTF-8, lowercases header names (as Node does) and joins array header values with `', '`. Before resolving it runs `expect(response.headers['x-robots-tag']?.toLowerCase()).toBe('noindex, nofollow')`, so every caller gets the former standalone check for free. `method` defaults to `GET`. `statusOf` issues a GET without that assertion and resolves `undefined` when the connection fails (`ECONNREFUSED`, `ECONNRESET`, socket errors).

- [ ] **Step 1: Scaffold the workspace**

`pnpm-workspace.yaml`: add `- 'deploy'` under `packages`. Root `eslint.config.ts`: add `'deploy/**'` to the ignore list of the default export.

`deploy/package.json`:

```json
{
    "name": "deploy",
    "private": true,
    "license": "AGPL-3.0-only",
    "type": "module",
    "scripts": {
        "lint": "eslint smoke",
        "lint:fix": "eslint smoke --fix",
        "typecheck": "tsc --noEmit -p tsconfig.json",
        "test": "vitest run",
        "test:smoke": "vitest run --config ./vitest.config.smoke.ts"
    }
}
```

then `pnpm --filter deploy add -D` with the ten packages from Global Constraints.

`deploy/tsconfig.json`: extends `../tsconfig.json`; `module` and `moduleResolution` `nodenext`, `target` `ES2023`, `types: ["node", "vitest/globals"]`, `noEmit`, `isolatedModules`, `esModuleInterop`, `erasableSyntaxOnly`, `verbatimModuleSyntax`; `include: ["smoke/**/*.ts"]`.

`deploy/eslint.config.ts`: like `apps/frontend/eslint.config.ts` but one directory up (`import { defineBaseConfig } from '../eslint.config.ts'`): `defineBaseConfig({ tsconfigRootDir: import.meta.dirname })`, `globals.node` + `sourceType: 'module'`, and `pluginVitest.configs.recommended` for `files: ['**/*.spec.ts', '**/*.smoke-spec.ts']`.

`deploy/vitest.config.ts`: `test: { globals: true, environment: 'node', include: ['smoke/**/*.spec.ts'] }`.

`deploy/vitest.config.smoke.ts`: `test: { globals: true, environment: 'node', include: ['smoke/**/*.smoke-spec.ts'], fileParallelism: false, bail: 1, hookTimeout: 600_000, testTimeout: 300_000, reporters: ['verbose'] }`.

- [ ] **Step 2: Install and check the wiring**

Run: `pnpm install`
Expected: no error; `pnpm-lock.yaml` gains an `importers` entry `deploy`.

Run: `pnpm turbo run lint typecheck test --dry-run=json | grep '"deploy#'`
Expected: `deploy#lint`, `deploy#typecheck` and `deploy#test` are listed, no `deploy#test:smoke`.

- [ ] **Step 3: Write the failing test `deploy/smoke/support/http.spec.ts`**

`beforeAll` starts `http.createServer` on `127.0.0.1`, port `0`, and records `base = http://127.0.0.1:<port>`; `afterAll` closes it. Routes: `GET /ok` answers 200 with `X-Robots-Tag: noindex, nofollow`, `Content-Type: text/plain` and body `ok`; `POST /echo` answers 200 with the robots header and the body `${req.method} ${req.headers['content-type']} ${requestBody}`; `GET /bare` answers 200 without the robots header.

```ts
it('returns status, lowercased headers and the body', async () => {
    const response = await request(`${base}/ok`)
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('text/plain')
    expect(response.body).toBe('ok')
})
it('sends method, headers and body', async () => {
    const response = await request(`${base}/echo`, 'POST', {
        headers: { 'Content-Type': 'application/json' },
        body: '{"a":1}',
    })
    expect(response.body).toBe('POST application/json {"a":1}')
})
it('fails when X-Robots-Tag is missing', async () => {
    await expect(request(`${base}/bare`)).rejects.toThrow(/noindex, nofollow/)
})
it('statusOf returns the status code, or undefined when nothing listens', async () => {
    expect(await statusOf(`${base}/bare`)).toBe(200)
    expect(await statusOf('http://127.0.0.1:1/')).toBeUndefined()
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter deploy test`
Expected: FAIL, the import of `./http.js` cannot be resolved.

- [ ] **Step 5: Implement `request` and `statusOf` in `deploy/smoke/support/http.ts`**

- [ ] **Step 6: Run the test to verify it passes, then the gate**

Run: `pnpm --filter deploy test`
Expected: 4 passed.

Run: `pnpm --filter deploy lint && pnpm --filter deploy typecheck && pnpm format:fix`
Expected: no errors.

- [ ] **Step 7: Report**

Leave the changes in the working tree and list the files touched (including `pnpm-lock.yaml`).

---

### Task 2: Log and output parsing helpers

**Files:**

- Create: `deploy/smoke/support/logs.ts`
- Test: `deploy/smoke/support/logs.spec.ts`

**Interfaces:**

- Produces (`deploy/smoke/support/logs.ts`):

```ts
export function setupTokenFrom(log: string): string | undefined
export function requestLogEntry(log: string, reqId: string, url: string): Record<string, unknown> | undefined
export function lastWord(output: string): string
```

`setupTokenFrom` returns the token of the last `Setup token: <32 hex chars>` occurrence (`smoke-test.sh:206`). `requestLogEntry` splits the log into lines, `JSON.parse`s each line that starts with `{` (ignoring parse errors), and returns the first object whose `reqId` equals `reqId` and whose `req.url` equals `url` (the backend's request serializer in `apps/backend/src/factories/logger.options.ts` writes the path as `req.url`; `smoke-test.sh:286-291`). `lastWord` returns the last whitespace-separated token of the last non-empty line, `''` for empty input (`smoke-test.sh:173-176`).

- [ ] **Step 1: Write the failing test `deploy/smoke/support/logs.spec.ts`**

```ts
const token = 'a'.repeat(32)
const later = 'b'.repeat(32)
it('setupTokenFrom returns the last logged token', () => {
    expect(setupTokenFrom(`x Setup token: ${token}\ny Setup token: ${later}\n`)).toBe(later)
})
it('setupTokenFrom ignores tokens that are not 32 hex characters', () => {
    expect(setupTokenFrom(`Setup token: ${'a'.repeat(31)}\n`)).toBeUndefined()
})
it('requestLogEntry finds the json line with the request id and url', () => {
    const log = [
        'plain text line',
        JSON.stringify({ level: 30, reqId: 'other', req: { url: '/api/setup/status' } }),
        JSON.stringify({ level: 30, reqId: 'wanted', req: { url: '/api/setup/status' }, res: { statusCode: 200 } }),
    ].join('\n')
    expect(requestLogEntry(log, 'wanted', '/api/setup/status')).toMatchObject({ res: { statusCode: 200 } })
    expect(requestLogEntry(log, 'wanted', '/other')).toBeUndefined()
})
it('lastWord returns the last token of the last line', () => {
    expect(lastWord('proxy 0123abcd\r\n')).toBe('0123abcd')
    expect(lastWord('')).toBe('')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter deploy test`
Expected: FAIL, `./logs.js` cannot be resolved.

- [ ] **Step 3: Implement the three functions in `deploy/smoke/support/logs.ts`**

- [ ] **Step 4: Run the tests, then the gate**

Run: `pnpm --filter deploy test`
Expected: 8 passed.

Run: `pnpm --filter deploy lint && pnpm --filter deploy typecheck && pnpm format:fix`
Expected: no errors.

- [ ] **Step 5: Report**

---

### Task 3: Stack fixture, compose and PKI helpers, the boot phase

**Files:**

- Create: `deploy/smoke/support/stack.ts`, `deploy/smoke/support/compose.ts`, `deploy/smoke/support/pki.ts`
- Create: `deploy/smoke/stack.smoke-spec.ts` (phases `compose configuration` and `boot without the mail server`)
- Reference: `deploy/smoke-test.sh:1-224`

**Interfaces:**

- Consumes: `request`, `statusOf` (Task 1); `setupTokenFrom`, `lastWord` (Task 2).
- Produces (`deploy/smoke/support/stack.ts`):

```ts
export const PROJECT_NAME = 'mailer-smoke'
export const MAIL_HOSTNAME = 'mail.smoke.test'
export const HTTP_PORT = 18080
export const HTTPS_PORT = 18443
export const SMTP_PORT = 18025
export const BASE_URL = `http://localhost:${HTTP_PORT}`
export const IMAGE = 'ghcr.io/schwarzdavid/mailer-backend'
export interface SmokeStack {
    dir: string
    composeFile: string
    overrideFile: string
    envFile: string
    mailPassword: string
    pkiDir: string
    caDir: string
    tlsDir: string
    renewDir: string
    tlsAwayDir: string
}
export function createStack(imageTag: string): Promise<SmokeStack>
export function destroyStack(stack: SmokeStack): Promise<void>
```

`createStack`: runs `docker image inspect ${IMAGE}:${imageTag}` and throws an `Error` whose message is `image <IMAGE>:<imageTag> not found; build it with: docker build -t <IMAGE>:<imageTag> .` on failure; creates `dir` with `mkdtemp(join(tmpdir(), 'mailer-smoke-'))`; copies `deploy/compose.yml` (resolved as `fileURLToPath(new URL('../../compose.yml', import.meta.url))`) to `<dir>/compose.yml`; writes `<dir>/compose.smoke.yml` with the exact YAML of `smoke-test.sh:107-119`, `<dir>/.env` with the keys of `smoke-test.sh:121-134` (secrets from `randomBytes(32).toString('base64')`, `IMAGE_TAG` from the argument); creates `pki`, `ca`, `tls`, `renew`, `tls-away`; calls `createCa` and `issueLeaf` into `tls`; then runs `new Compose(stack).run(['down', '-v', '--remove-orphans'], { reject: false })`. `destroyStack`: the same `down`, then `rm(dir, { recursive: true, force: true })`.

- Produces (`deploy/smoke/support/compose.ts`):

```ts
export interface RunOptions {
    input?: string
    env?: Record<string, string>
    reject?: boolean
}
export interface RunResult {
    stdout: string
    stderr: string
    exitCode: number | undefined
}
export class Compose {
    constructor(stack: SmokeStack, extraFiles?: string[])
    withFile(file: string): Compose
    run(args: string[], options?: RunOptions): Promise<RunResult>
    services(): Promise<string[]>
    containerId(service: string): Promise<string>
    health(service: string): Promise<string>
    waitHealthy(service: string, timeoutMs: number): Promise<boolean>
    inspect(containerId: string, format: string): Promise<string>
    logs(service?: string): Promise<string>
    psql(sql: string): Promise<string>
    execNode(scriptFile: string, env: Record<string, string>): Promise<string>
    publishedPort(service: string, port: number): Promise<string>
    configHash(service: string, envFile: string, composeFile?: string): Promise<string>
}
```

`run` executes `docker compose -p PROJECT_NAME --project-directory <dir> -f <composeFile> -f <overrideFile> [-f extra…] <args>` through `execa` with `reject` defaulting to `true`, and strips `\r` from `stdout` and `stderr`. `withFile` returns a new instance with one more `-f`. `services` is `config --services`. `containerId` is `ps -q <service>` (`''` when absent). `health` mirrors `smoke-test.sh:48-56` (`absent`, `none` or the Docker health status). `waitHealthy` polls `health` every 2 s and resolves `false` on timeout. `inspect` runs `docker inspect --format <format> <id>`. `logs` is `logs --no-color --no-log-prefix [service]` and returns `stdout + stderr`. `psql` is `exec -T postgres psql -U mailer -d mailer -tAc <sql>`, trimmed. `execNode` is `exec -T -e K=V… backend node --input-type=module-typescript` with the file's content as `input`, returning `stdout`. `publishedPort` mirrors `smoke-test.sh:70-72` (`docker port <id> <port>`, first line, `''` when none). `configHash` runs `config --hash <service>` with `--env-file <envFile>` and `-f <composeFile ?? stack.composeFile> -f <overrideFile>` and returns `lastWord(stdout)` (`smoke-test.sh:173-176`).

- Produces (`deploy/smoke/support/pki.ts`):

```ts
export function createCa(pkiDir: string, caDir: string): Promise<void>
export function issueLeaf(pkiDir: string, caDir: string, outDir: string, hostname: string): Promise<void>
export function serialOf(certFile: string): Promise<string>
export function servedSmtpSerial(port: number, hostname: string): Promise<string>
export function servedImapSerial(compose: Compose): Promise<string>
```

`createCa` writes `<pkiDir>/ca.cnf` (`smoke-test.sh:137-150`) and runs `smoke-test.sh:162-163` (key in `pkiDir`, `ca.crt` in `caDir`). `issueLeaf` writes `<pkiDir>/leaf.cnf` from the template of `smoke-test.sh:151-161` with `hostname`, then runs `smoke-test.sh:74-80` (serial `0x` + 16 random bytes hex, 2 days). `serialOf` returns the trimmed stdout of `openssl x509 -noout -serial -in <file>` (`serial=…`). `servedSmtpSerial` runs `openssl s_client -starttls smtp -connect localhost:<port> -servername <hostname>` with `input: ''` and pipes its stdout into `openssl x509 -noout -serial`, resolving `''` when either fails. `servedImapSerial` runs the `sh` snippet of `smoke-test.sh:92-95` through `compose.run(['exec', '-T', 'mail', 'sh', '-c', snippet], { reject: false })`.

- [ ] **Step 1: Write the spec skeleton and the first five tests in `deploy/smoke/stack.smoke-spec.ts`**

Module state: `let stack: SmokeStack | undefined`, `let compose: Compose`. `beforeAll` sets `stack = await createStack(process.env.IMAGE_TAG ?? 'local')` and `compose = new Compose(stack)`; `afterAll` calls `destroyStack(stack)` when `stack` is set.

`describe('compose configuration')`, port of `smoke-test.sh:173-192`:

```ts
it('the proxy config hash follows SITE_ADDRESS, MAIL_HOSTNAME and the Caddyfile, the mail config hash follows MAIL_HOSTNAME and postfix-main.cf', async () => {
    const original = await readFile(stack.composeFile, 'utf8')
    const edited = original
        .replace('respond 404', 'respond 410')
        .replace('localhost.$$mydomain, localhost', 'localhost')
    expect(edited).not.toBe(original)
    const proxyHash = await compose.configHash('proxy', stack.envFile)
    expect(proxyHash).not.toBe('')
    expect(await compose.configHash('proxy', siteEnv)).not.toBe(proxyHash)
    expect(await compose.configHash('proxy', mailEnv)).not.toBe(proxyHash)
    const mailHash = await compose.configHash('mail', stack.envFile)
    expect(mailHash).not.toBe('')
    expect(await compose.configHash('mail', mailEnv)).not.toBe(mailHash)
    expect(await compose.configHash('proxy', stack.envFile, editedFile)).not.toBe(proxyHash)
    expect(await compose.configHash('mail', stack.envFile, editedFile)).not.toBe(mailHash)
})
```

Before the hash calls the test writes `<dir>/compose.edited.yml` with `edited`, `<dir>/hash-site.env` (the `.env` content with `SITE_ADDRESS=hash-check.smoke.test`) and `<dir>/hash-mail.env` (with `MAIL_HOSTNAME=hash-check-mail.smoke.test`); `editedFile`, `siteEnv` and `mailEnv` are those paths.

`describe('boot without the mail server')`, port of `smoke-test.sh:194-224`:

- `it('stack without mail is up and healthy')`: `services = (await compose.services()).filter((s) => s !== 'mail')`; `await compose.run(['up', '-d', '--pull', 'missing', '--wait', ...services])` resolves.
- `it('readiness reports the missing mail server while liveness stays up')`: `GET /api/health` is 200; `GET /api/health/ready` is 503 and `JSON.parse(body).details.smtp.status` is `'down'`.
- `it('the backend logs a setup token on first start and refuses a wrong one')`: `token = setupTokenFrom(await compose.logs('backend'))` is defined; `wrong = '0'.repeat(32)` differs from it; `POST /api/setup/user` with `Content-Type: application/json` and the body of `smoke-test.sh:209-211` (`setupToken: wrong`) answers 403.
- `it('the proxy is the stock caddy image and there is no web service')`: `services` contains `proxy` and not `web`; `id = await compose.containerId('proxy')` is non-empty; `await compose.inspect(id, '{{.Config.Image}}')` matches `/^caddy:2\.\d+\.\d+-alpine$/`.

- [ ] **Step 2: Run the suite to verify it fails**

Run: `IMAGE_TAG=local pnpm --filter deploy test:smoke`
Expected: FAIL, `./support/stack.js` cannot be resolved.

- [ ] **Step 3: Implement `deploy/smoke/support/pki.ts`**

- [ ] **Step 4: Implement `deploy/smoke/support/compose.ts`**

- [ ] **Step 5: Implement `deploy/smoke/support/stack.ts`**

- [ ] **Step 6: Build the image once and run the suite**

Run: `docker build -t ghcr.io/schwarzdavid/mailer-backend:local .`
Run: `IMAGE_TAG=local pnpm --filter deploy test:smoke`
Expected: 5 passed, then `docker compose -p mailer-smoke ps -q` prints nothing and the temp dir is gone.

- [ ] **Step 7: Gate**

Run: `pnpm --filter deploy lint && pnpm --filter deploy typecheck && pnpm --filter deploy test && pnpm format:fix`
Expected: no errors, 8 unit tests passed.

- [ ] **Step 8: Verify a dirty host is cleaned (Review Focus 1)**

Start `IMAGE_TAG=local pnpm --filter deploy test:smoke`, kill the process right after `stack without mail is up and healthy` passes, confirm `docker compose -p mailer-smoke ps -q` lists containers, then run the suite again.
Expected: the second run passes all 5 tests.

- [ ] **Step 9: Verify the missing-image and failed-setup paths (Review Focus 2 and 3)**

Run: `IMAGE_TAG=does-not-exist pnpm --filter deploy test:smoke`
Expected: the run fails in `beforeAll` with a message containing `build it with: docker build -t ghcr.io/schwarzdavid/mailer-backend:does-not-exist .`, all tests are skipped, and no `mailer-smoke-*` directory remains under the temp dir.

- [ ] **Step 10: Report**

---

### Task 4: Mail server phase, routing and headers, throttling and logs

**Files:**

- Modify: `deploy/smoke/stack.smoke-spec.ts` (phases `mail server`, `routing and headers`, `throttling and logs`)
- Reference: `deploy/smoke-test.sh:226-336`

**Interfaces:**

- Consumes: `Compose.run`, `waitHealthy`, `logs` (Task 3); `request`, `statusOf` (Task 1); `requestLogEntry` (Task 2).
- Produces: module state `indexHtml: string` and `asset: string` set by the routing tests and reused in the same file.

- [ ] **Step 1: Add the tests**

`describe('mail server')`, port of `smoke-test.sh:226-238`:

- `it('mail is up and healthy with the bounce account')`: `run(['up', '-d', '--pull', 'missing', 'mail'])`; `run(['exec', '-T', 'mail', 'setup', 'email', 'add', 'bounce@' + MAIL_HOSTNAME, stack.mailPassword])`; `run(['exec', '-T', 'mail', 'setup', 'alias', 'add', 'postmaster@' + MAIL_HOSTNAME, 'bounce@' + MAIL_HOSTNAME])`; `expect(await compose.waitHealthy('mail', 120_000)).toBe(true)`.
- `it('readiness is 200 once the mail server accepts connections')`: `await expect.poll(async () => (await request(BASE_URL + '/api/health/ready')).status, { interval: 1_000, timeout: 30_000 }).toBe(200)`.

`describe('routing and headers')`, port of `smoke-test.sh:240-308`, with a `beforeAll` that polls `statusOf(BASE_URL + '/')` every second for up to 30 s until it is defined:

- `it('GET / serves the SPA')`: 200, body contains `<div id="app">`; store it as `indexHtml`.
- `it('GET /projects/5 falls back to index.html')`: 200, body contains `<div id="app">`.
- `it('cache headers: no-cache for the shell, immutable for assets')`: `GET /` has `cache-control` matching `/no-cache/i`; `asset = /\/assets\/[^"]+\.js/.exec(indexHtml)?.[0]` is defined; `GET <asset>` is 200 with `cache-control` matching `/immutable/i`.
- `it('the proxy compresses assets')`: `GET <asset>` with `Accept-Encoding: gzip` is 200 and `content-encoding` matches `/^gzip/i`.
- `it('missing asset returns 404 without immutable caching')`: `GET /assets/does-not-exist.js` is 404 and `cache-control` does not match `/immutable/i`.
- `it('GET /api/setup/status returns JSON')`: 200, `content-type` matches `/application\/json/i`.
- `it('the backend writes json request logs with request ids')`: `requestId = headers['x-request-id']` of a fresh `GET /api/setup/status` matches `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`; `await expect.poll(async () => requestLogEntry(await compose.logs('backend'), requestId, '/api/setup/status'), { interval: 1_000, timeout: 10_000 }).toBeDefined()`.
- `it('an unknown /api path returns a JSON 404, not the SPA')`: `GET /api/does-not-exist` is 404, JSON content type, body without `<div id="app">`.
- `it('GET /docs falls back to the SPA and does not expose swagger-ui')`: 200, body without `swagger-ui`, with `<div id="app">`.

`describe('throttling and logs')`, port of `smoke-test.sh:312-336`:

- `it('forged X-Forwarded-For does not evade the login throttle')`: for `i` from 1 to 11, `POST /api/auth/login` with `Content-Type: application/json`, `X-Forwarded-For: 203.0.113.<i>` and body `{"email":"smoke@example.com","password":"wrong-password"}`; status is 401 for `i <= 10` and 429 for `i === 11`.
- `it('query-string API keys never reach the container logs')`: `marker = 'sdm_smokelog_' + <24 alphanumeric characters from randomBytes>`; `POST /api/v1/send?key=<marker>` with the JSON body of `smoke-test.sh:328` is 401; `GET /api/setup/status?key=<marker>` is 200; `await compose.logs()` does not contain `marker`.

- [ ] **Step 2: Run the suite**

Run: `IMAGE_TAG=local pnpm --filter deploy test:smoke`
Expected: 18 passed.

- [ ] **Step 3: Gate and report**

Run: `pnpm --filter deploy lint && pnpm --filter deploy typecheck && pnpm format:fix`
Expected: no errors.

---

### Task 5: Mail submission, relay and bounces

**Files:**

- Create: `deploy/smoke/container/submission-check.ts`, `deploy/smoke/container/relay-check.ts`, `deploy/smoke/support/smtp.ts`
- Modify: `deploy/smoke/stack.smoke-spec.ts` (phase `mail submission, relay and bounces`)
- Reference: `deploy/smoke-test.sh:338-450`, fixture `dev/fixtures/dsn-permanent.eml`

**Interfaces:**

- Consumes: `Compose.execNode`, `psql`, `publishedPort` (Task 3); `SMTP_PORT`, `MAIL_HOSTNAME` (Task 3).
- Produces (`deploy/smoke/support/smtp.ts`):

```ts
export function relayFromOutside(port: number): Promise<string>
export function deliverDsn(port: number, recipient: string, raw: string): Promise<void>
```

Both create a `nodemailer` transport `{ host: 'localhost', port, secure: false, ignoreTLS: true }` and close it afterwards. `relayFromOutside` sends the message of `smoke-test.sh:401-402` (`smoke@example.org` to `victim@example.org`, subject and text `relay`) and resolves with the SMTP error's `response` text; it rejects with `Error('port 25 relayed mail for victim@example.org')` when the server accepted it. `deliverDsn` sends `{ envelope: { from: '', to: recipient }, raw }`.

- Produces (`deploy/smoke/container/submission-check.ts`): the script of `smoke-test.sh:339-389` in TypeScript (erasable syntax; errors typed as `Error & { command?: string; responseCode?: number; response?: string }`), printing the same lines (`without servername the certificate is refused: …`, `verify ok against … on …`, `own envelope accepted: …`, `foreign envelope rejected: command=… responseCode=… response=…`) and throwing on the same conditions.
- Produces (`deploy/smoke/container/relay-check.ts`): the script of `smoke-test.sh:409-432`, printing `unauthenticated relay rejected: …` and throwing when the relay was accepted.

- [ ] **Step 1: Add the tests**

`describe('mail submission, relay and bounces')`, with `const containerScript = (name: string) => fileURLToPath(new URL('./container/' + name, import.meta.url))`:

- `it('authenticated submission on mail:587 verifies the certificate against the mail hostname and spoof protection rejects a foreign envelope')`: `out = await compose.execNode(containerScript('submission-check.ts'), { SMOKE_DOMAIN: MAIL_HOSTNAME })`; `out` matches `/^foreign envelope rejected: command=RCPT TO responseCode=5/m` and `/^verify ok against mail\.smoke\.test on mail:587/m`.
- `it('port 25 from outside rejects relaying')`: `expect(await relayFromOutside(SMTP_PORT)).toMatch(/Relay access denied/)`.
- `it('mail:25 from the backend network rejects unauthenticated relaying')`: `out = await compose.execNode(containerScript('relay-check.ts'), { SMOKE_DOMAIN: MAIL_HOSTNAME })` matches `/^unauthenticated relay rejected: .*Relay access denied/m`.
- `it('the DSN delivered on port 25 is ingested over IMAP into the bounce table')`: `raw = await readFile(fileURLToPath(new URL('../../dev/fixtures/dsn-permanent.eml', import.meta.url)), 'utf8')`; `await deliverDsn(SMTP_PORT, 'bounce@' + MAIL_HOSTNAME, raw)`; `await expect.poll(async () => Number(await compose.psql('select count(*) from bounce')), { interval: 5_000, timeout: 150_000 }).toBeGreaterThanOrEqual(1)`.
- `it('mail publishes only port 25; 587 and 143 stay internal')`: `publishedPort('mail', 587)` and `publishedPort('mail', 143)` are `''`; `publishedPort('mail', 25)` matches `/:18025$/`.

- [ ] **Step 2: Run the suite to verify the new tests fail**

Run: `IMAGE_TAG=local pnpm --filter deploy test:smoke`
Expected: 18 passed, then FAIL at the submission test (`./support/smtp.js` or the container script missing).

- [ ] **Step 3: Write the two container scripts and `deploy/smoke/support/smtp.ts`**

- [ ] **Step 4: Run the suite**

Run: `IMAGE_TAG=local pnpm --filter deploy test:smoke`
Expected: 23 passed.

- [ ] **Step 5: Gate and report**

Run: `pnpm --filter deploy lint && pnpm --filter deploy typecheck && pnpm format:fix`
Expected: no errors; `typecheck` covers the container scripts (they are under `smoke/`).

---

### Task 6: Mail certificate lifecycle

**Files:**

- Modify: `deploy/smoke/stack.smoke-spec.ts` (phase `mail certificate lifecycle`)
- Reference: `deploy/smoke-test.sh:452-479`

**Interfaces:**

- Consumes: `serialOf`, `issueLeaf`, `servedSmtpSerial`, `servedImapSerial` (Task 3); `Compose.run`, `waitHealthy`, `inspect`, `containerId` (Task 3).
- Produces: module state `initialSerial: string`.

- [ ] **Step 1: Add the tests**

`describe('mail certificate lifecycle')`, with a helper `moveAll(from: string, to: string)` that renames every entry of `from` into `to` (overwriting):

- `it('mail stays unhealthy for 60 s without a certificate')`: `initialSerial = await serialOf(join(stack.tlsDir, MAIL_HOSTNAME + '.crt'))`; `run(['stop', 'mail'])` and `run(['rm', '-f', 'mail'])` with `reject: false`; `moveAll(stack.tlsDir, stack.tlsAwayDir)`; `run(['up', '-d', 'mail'])`; `expect(await compose.waitHealthy('mail', 60_000)).toBe(false)`.
- `it('mail recovers on its own once the certificate appears')`: `moveAll(stack.tlsAwayDir, stack.tlsDir)`; `expect(await compose.waitHealthy('mail', 180_000)).toBe(true)`.
- `it('renewed certificate is served on 25 and 143 without a restart')`: `servedSmtpSerial(SMTP_PORT, MAIL_HOSTNAME)` and `servedImapSerial(compose)` both equal `initialSerial`; `await issueLeaf(stack.pkiDir, stack.caDir, stack.renewDir, MAIL_HOSTNAME)`; `renewedSerial = await serialOf(join(stack.renewDir, …crt))` differs from `initialSerial`; `started = await compose.inspect(await compose.containerId('mail'), '{{.State.StartedAt}} {{.RestartCount}}')`; `moveAll(stack.renewDir, stack.tlsDir)`; `await expect.poll(async () => [await servedSmtpSerial(SMTP_PORT, MAIL_HOSTNAME), await servedImapSerial(compose)], { interval: 3_000, timeout: 90_000 }).toEqual([renewedSerial, renewedSerial])`; `inspect(…)` again equals `started`.

- [ ] **Step 2: Run the suite**

Run: `IMAGE_TAG=local pnpm --filter deploy test:smoke`
Expected: 26 passed.

- [ ] **Step 3: Gate and report**

Run: `pnpm --filter deploy lint && pnpm --filter deploy typecheck && pnpm format:fix`
Expected: no errors.

---

### Task 7: Migrations and updates

**Files:**

- Modify: `deploy/smoke/stack.smoke-spec.ts` (phases `migrations` and `updates`)
- Reference: `deploy/smoke-test.sh:481-523`

**Interfaces:**

- Consumes: `Compose.run`, `withFile`, `psql`, `logs`, `waitHealthy`, `containerId` (Task 3); `request`, `statusOf` (Task 1).

- [ ] **Step 1: Add the tests**

`describe('migrations')`, with `const failingMigration = '017-harden-inbound-forms'`:

- `it('the backend applied every migration when it started')`: `out = (await compose.run(['exec', '-T', 'backend', 'node', 'dist/migrate.js', 'pending', '--json'])).stdout`; its last non-empty line, trimmed, is `'[]'`.
- `it('a failed upstream request is logged with the key query parameter redacted')`: `psql` with `DELETE FROM "SequelizeMeta" WHERE name = '<failingMigration>'`; `run(['restart', 'backend'])`; `await expect.poll(() => compose.logs('backend'), { interval: 2_000, timeout: 60_000 }).toContain('Migration ' + failingMigration + ' (up) failed')`; `downMarker = 'sdm_smokedown_' + <24 alphanumerics>`; `expect(await statusOf(BASE_URL + '/api/setup/status?key=' + downMarker)).toBe(502)`; `proxyLog = await compose.logs('proxy')` contains `key=REDACTED` and not `downMarker`.
- `it('a failing migration keeps the backend from serving, and it recovers once the migrations run')`: `expect(await statusOf(BASE_URL + '/api/setup/status')).not.toBe(200)`; `psql` with `INSERT INTO "SequelizeMeta" (name) VALUES ('<failingMigration>')`; `run(['restart', 'backend'])`; `expect(await compose.waitHealthy('backend', 120_000)).toBe(true)`; `GET /api/setup/status` is 200.

`describe('updates')`:

- `it('up -d replaces the backend')`: `oldId = await compose.containerId('backend')` is non-empty; write `<dir>/compose.revision.yml` with the YAML of `smoke-test.sh:514-518`; `await compose.withFile(revisionFile).run(['up', '-d', '--pull', 'missing', '--wait'])`; `GET /api/setup/status` is 200; `await compose.containerId('backend')` differs from `oldId`.

- [ ] **Step 2: Run the suite**

Run: `IMAGE_TAG=local pnpm --filter deploy test:smoke`
Expected: 30 passed, and afterwards `docker compose -p mailer-smoke ps -q` prints nothing.

- [ ] **Step 3: Gate and report**

Run: `pnpm --filter deploy lint && pnpm --filter deploy typecheck && pnpm format:fix`
Expected: no errors.

---

### Task 8: CI, documentation and removal of the Bash script

**Files:**

- Modify: `.github/workflows/ci.yml` (job `image`: add `- uses: ./.github/actions/setup` after the checkout step; replace `run: IMAGE_TAG=ci bash deploy/smoke-test.sh` with `run: IMAGE_TAG=ci pnpm --filter deploy test:smoke`)
- Modify: `CLAUDE.md` (Repository layout: "Three workspaces (`apps/*`, `packages/*`)" becomes four with a bullet for `deploy`; the `deploy/` sentence names `smoke/` instead of `smoke-test.sh`; Common commands: "needs Docker, curl and openssl" becomes "needs Docker and openssl" and the command becomes `IMAGE_TAG=local pnpm --filter deploy test:smoke`)
- Modify: `README.md` (step 11 "Local smoke test": the requirements sentence and the command block; the sentence "runs `deploy/smoke-test.sh` against it" in "CI and release pipeline")
- Delete: `deploy/smoke-test.sh`

**Interfaces:**

- Consumes: the complete suite (Tasks 1–7).

- [ ] **Step 1: Edit `ci.yml`, `CLAUDE.md` and `README.md`**

The README step 11 keeps its list of what the test checks and gains one sentence: the suite lives in the `deploy` workspace (`deploy/smoke/`), its unit tests run with `pnpm --filter deploy test`, and on Windows `openssl` must be on `PATH` (Git Bash).

- [ ] **Step 2: Run the full gate with the Bash script still present**

Run: `pnpm check`
Expected: lint, typecheck, unit tests and the format check pass for every workspace, `deploy` included.

Run: `IMAGE_TAG=local pnpm --filter deploy test:smoke`
Expected: 30 passed.

- [ ] **Step 3: Delete `deploy/smoke-test.sh`**

Run: `grep -rn "smoke-test.sh" --include=*.md --include=*.yml --include=*.yaml --include=*.json --include=*.ts . --exclude-dir=node_modules --exclude-dir=.superpowers`
Expected: only hits under `docs/superpowers/` (the spec and this plan).

- [ ] **Step 4: Final check and report**

Run: `pnpm format`
Expected: no files listed.

Report the files touched, the deleted script, and that CI has not run this job on GitHub yet (the workflow has never run; the first push will show whether the `setup` action adds acceptable time to the `image` job).
