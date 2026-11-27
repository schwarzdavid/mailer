# mailer CLI, project 1: CLI, launcher and project format — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `deploy/setup.sh` with the host launcher `deploy/mailer.sh` and a Node CLI inside the mailer image that sets up an install directory, hands secrets to Compose safely, and can hand an installation over to a newer image.

**Architecture:** A new private workspace `packages/cli` is bundled into one file and shipped in the image as the executable `mailer`, next to copies of `deploy/compose.yml` and `deploy/mailer.sh`. The container only reads and writes files in the mounted install directory; `mailer.sh` (POSIX `sh`) runs every Docker command. An update is two frozen steps: the old launcher runs the target image's `mailer migrate-project`, then `exec`s the new `mailer.sh _finish-update`.

**Tech Stack:** TypeScript (ESM, erasable syntax only), `tsdown`, Vitest, `@clack/prompts`, `node:util` `parseArgs`, POSIX `sh`, Docker Compose ≥ 2.23.1.

**Spec:** `docs/superpowers/specs/2026-11-26-mailer-cli-design.md`. This plan covers "Delivery order" item 1 only. Out of scope here, by the spec's order: `resolve-update`, pre-update dump, automatic rollback, `rollback`, `backup`/`restore`, storage, schedules, auto-update and its wizard question, `state/`, version awareness in the UI, the npm-before-image pipeline order.

## Decisions beyond the spec

Made while planning; the owner reviews them with this plan.

- `update` needs `--to <version>` in this project. Finding the newest release (`resolve-update`) comes with project 2, and with it a plain `sh mailer.sh update`.
- The wizard does not ask about auto-update yet; the question arrives with the feature in project 2.
- `doctor` runs on the host, with no container: everything it checks is on the host.
- `deploy/.env.example` is deleted. The wizard writes `.env`; the installation page shows the keys for an unattended installation.
- The CLI learns its own version from a build argument (`MAILER_VERSION`), and the launcher tells it which tag it was started as (`--image-tag`), so a locally built or test image pins its own tag.
- An update does not run `docker compose pull`; it starts the stack with `--pull missing`.
- Typed secrets are limited to `A-Z a-z 0-9 + / = _ -`, at least 32 characters for the two backend secrets and 16 for the other two.

## Global Constraints

- **Git.** `CLAUDE.md` forbids git operations, but for this plan the owner allowed commits on the branch `setup` (2026-11-27). Each task ends with one commit of its own files after its verification passed. Commit messages carry no `Co-Authored-By` line. Implementers never push, switch branches, amend or rewrite history; the controller pushes.
- **No comments** in code, shell included, except the shebang.
- Every task ends green on `pnpm typecheck` and `pnpm lint` for the workspaces it touched; run `pnpm format:fix` instead of hand-formatting.
- No container gets the Docker socket. No secret value in a log or a command argument.
- `mailer.sh` is POSIX `sh` (no bashisms) and needs only Docker with Compose ≥ 2.23.1.
- Image name is `ghcr.io/schwarzdavid/mailer`. Install directory is mounted at `/project`.
- Frozen contract, never to change after this ships:
    - `docker run --rm -i [-t] --user "$(id -u):$(id -g)" -e HOME=/tmp -v "<dir>:/project" ghcr.io/schwarzdavid/mailer:<tag> mailer migrate-project --image-tag <tag> [--dry-run]`
    - exit code `0` = migrated, `3` = needs manual action and nothing changed, anything else = failure
    - after `0`: `exec sh ./mailer.sh _finish-update <from-tag> <to-tag>`
- Launcher state lives in `.env` under `MAILER_`: `MAILER_FORMAT_VERSION` (integer, current `1`), `MAILER_PREVIOUS_IMAGE_TAG`, `MAILER_SECRETS_WRAPPER`.
- The four secrets: `DB_PASSWORD`, `BACKEND_JWT_SECRET`, `BACKEND_ENCRYPTION_SECRET`, `MAIL_PASSWORD`.
- `compose.yml` and `mailer.sh` in an install directory are owned by the CLI; operator changes live in `compose.override.yml`, which nothing here touches.
- Test doubles follow `CLAUDE.md` "Testing": typed `vi.fn`, no loose literals.

## Review Focus

1. **`.env` saved with CRLF or quoted values** (edited on Windows): reading returns the bare value and writing keeps every unrelated line. → Task 1.
2. **Wizard cancelled half-way** (Ctrl-C): nothing is written, no partial `.env`. → Task 3.
3. **A typed secret with `$`, `#`, a space or a quote**: refused before it reaches `.env`, where Compose would reinterpret it. → Task 1.
4. **Install directory with a space in its path**: every launcher command still works. → Task 6.
5. **`update --to` an image that cannot be pulled, or the version already running**: nothing changes and no `.update-lock` is left behind. → Tasks 4 and 6.

## File Structure

```
packages/cli/                      new private workspace "mailer-cli"
  package.json, tsconfig.json, tsdown.config.ts, vitest.config.ts, eslint.config.ts
  src/bin.ts                       process entry: run(process.argv.slice(2)) → exit code
  src/main.ts                      argument parsing and command dispatch
  src/errors.ts                    CliError and exit codes
  src/context.ts                   CliContext
  src/env-file.ts                  .env reader/writer that preserves foreign lines
  src/secrets.ts                   secret keys, generation, validation, fingerprint
  src/project.ts                   format detection, asset writing, image-tag resolution
  src/legacy-templates.ts          sha256 of every released deploy/compose.yml
  src/prompter.ts                  Prompter interface + @clack/prompts implementation
  src/commands/setup.ts
  src/commands/migrate-project.ts
  src/commands/recovery-kit.ts
  src/migrations/index.ts          ordered project migrations (empty at format 1)
  src/**/*.spec.ts                 unit specs beside the source
  test/fixtures/format-1/          a released install directory, the first compatibility fixture
  test/launcher.spec.ts            mailer.sh against a fake docker
deploy/mailer.sh                   replaces deploy/setup.sh
deploy/compose.yml                 secrets through environment interpolation
deploy/.env.example                deleted (the wizard writes .env)
Dockerfile, .dockerignore          image carries the CLI and its assets
e2e/smoke/**                       suite drives mailer.sh
.github/workflows/ci.yml           version build arg, mailer.sh release asset
apps/docs/**, README.md, CONTRIBUTING.md, CLAUDE.md
```

---

### Task 1: CLI workspace, `.env` file and secrets

**Files:**
- Create: `packages/cli/package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, `eslint.config.ts`
- Create: `packages/cli/src/errors.ts`, `src/context.ts`, `src/env-file.ts`, `src/secrets.ts`
- Test: `packages/cli/src/env-file.spec.ts`, `src/secrets.spec.ts`

**Interfaces — Produces:**

```ts
export const EXIT = { ok: 0, failure: 1, usage: 2, manual: 3 } as const
export class CliError extends Error {
    constructor(message: string, readonly exitCode: 1 | 2 | 3 = 1)
}

export interface CliContext {
    projectDir: string
    assetsDir: string
    bakedVersion: string
    env: Record<string, string | undefined>
    interactive: boolean
    out: (line: string) => void
}

export class EnvFile {
    static parse(content: string): EnvFile
    static read(path: string): Promise<EnvFile>
    get(key: string): string | undefined
    has(key: string): boolean
    set(key: string, value: string): void
    toString(): string
    write(path: string): Promise<void>
}

export const SECRET_KEYS = ['DB_PASSWORD', 'BACKEND_JWT_SECRET', 'BACKEND_ENCRYPTION_SECRET', 'MAIL_PASSWORD'] as const
export type SecretKey = (typeof SECRET_KEYS)[number]
export function generateSecret(): string
export function typedSecretProblem(key: SecretKey, value: string): string | undefined
export function secretFingerprint(secret: string): string
```

- [ ] **Step 1: Scaffold the workspace.** Model every config on `packages/client-js`: same `tsconfig.json` without `"DOM"` in `lib`, same `eslint.config.ts` with `globals.node` only, same `vitest.config.ts`. `package.json`: name `mailer-cli`, `private: true`, `type: module`, license `AGPL-3.0-only`, scripts `build` (`tsdown`), `lint`, `lint:fix`, `typecheck`, `test` (`vitest run`); `@clack/prompts` as a dev dependency (it is bundled). `tsdown.config.ts`: entry `{ mailer: 'src/bin.ts' }`, `format: 'esm'`, `platform: 'node'`, `dts: false`, `clean: true`, every dependency bundled so `dist/mailer.js` runs with no `node_modules`. Run `pnpm install`.

- [ ] **Step 2: Write the failing `EnvFile` spec.**

```ts
it('reads the last occurrence and strips one pair of quotes and a trailing CR', () => {
    const env = EnvFile.parse('A=1\r\nB="two words"\r\nC=\'x\'\r\nA=2\r\n')
    expect(env.get('A')).toBe('2')
    expect(env.get('B')).toBe('two words')
    expect(env.get('C')).toBe('x')
    expect(env.get('MISSING')).toBeUndefined()
})
it('has() is false for an empty value', () => {
    const env = EnvFile.parse('A=\nB=x\n')
    expect(env.has('A')).toBe(false)
    expect(env.has('B')).toBe(true)
})
it('set() replaces in place, appends new keys and keeps foreign lines and comments', () => {
    const env = EnvFile.parse('# note\nA=1\n\nCUSTOM=keep\n')
    env.set('A', '9')
    env.set('NEW', 'v')
    expect(env.toString()).toBe('# note\nA=9\n\nCUSTOM=keep\nNEW=v\n')
})
it('normalises CRLF to LF on output', () => {
    expect(EnvFile.parse('A=1\r\nB=2\r\n').toString()).toBe('A=1\nB=2\n')
})
it('read() of a missing file is empty, write() is atomic and private', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mailer-cli-'))
    const path = join(dir, '.env')
    const env = await EnvFile.read(path)
    env.set('A', '1')
    await env.write(path)
    expect(await readFile(path, 'utf8')).toBe('A=1\n')
    expect(await readdir(dir)).toEqual(['.env'])
    if (process.platform !== 'win32') {
        expect((await stat(path)).mode & 0o777).toBe(0o600)
    }
})
```

- [ ] **Step 3: Run it and see it fail.** `pnpm --filter mailer-cli exec vitest run src/env-file.spec.ts` → FAIL, module not found.

- [ ] **Step 4: Implement `errors.ts`, `context.ts`, `env-file.ts`.** `write` writes a temporary file in the same directory with mode `0o600` and renames it over the target.

- [ ] **Step 5: Write the failing secrets spec.**

```ts
it('generates 64 base64 characters', () => {
    expect(generateSecret()).toMatch(/^[A-Za-z0-9+/]{64}$/)
    expect(generateSecret()).not.toBe(generateSecret())
})
it('requires 32 characters for the backend secrets and 16 for the others', () => {
    expect(typedSecretProblem('BACKEND_JWT_SECRET', 'a'.repeat(31))).toBeDefined()
    expect(typedSecretProblem('BACKEND_JWT_SECRET', 'a'.repeat(32))).toBeUndefined()
    expect(typedSecretProblem('BACKEND_ENCRYPTION_SECRET', 'a'.repeat(31))).toBeDefined()
    expect(typedSecretProblem('DB_PASSWORD', 'a'.repeat(15))).toBeDefined()
    expect(typedSecretProblem('MAIL_PASSWORD', 'a'.repeat(16))).toBeUndefined()
})
it.each(['$', '#', ' ', '"', "'", '\\'])('refuses %j in a typed secret', (character) => {
    expect(typedSecretProblem('DB_PASSWORD', `${'a'.repeat(40)}${character}`)).toBeDefined()
})
it('fingerprints a secret without revealing it', () => {
    const fingerprint = secretFingerprint('a'.repeat(32))
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(secretFingerprint('a'.repeat(32))).toBe(fingerprint)
    expect(secretFingerprint('b'.repeat(32))).not.toBe(fingerprint)
})
```

- [ ] **Step 6: Implement `secrets.ts`.** `generateSecret` is `randomBytes(48).toString('base64')`. A typed secret may only contain `A-Z a-z 0-9 + / = _ -`. `secretFingerprint` is the first 16 hex characters of HMAC-SHA256 keyed with the secret over the fixed message `mailer:encryption-secret:v1`.

- [ ] **Step 7: Verify.** `pnpm --filter mailer-cli test`, `pnpm --filter mailer-cli typecheck`, `pnpm --filter mailer-cli lint`, `pnpm --filter mailer-cli build` → all pass, `packages/cli/dist/mailer.js` exists.

---

### Task 2: Project format, assets and image tag

**Files:**
- Create: `packages/cli/src/project.ts`, `src/legacy-templates.ts`
- Test: `packages/cli/src/project.spec.ts`

**Interfaces:**
- Consumes: `EnvFile`, `CliError`, `EXIT`, `CliContext` (Task 1).
- Produces:

```ts
export const CURRENT_FORMAT = 1
export type ProjectFormat = 'fresh' | number
export type ComposeOrigin = 'absent' | 'current' | 'released' | 'edited'
export function detectFormat(projectDir: string): Promise<ProjectFormat>
export function composeOrigin(projectDir: string, assetsDir: string): Promise<ComposeOrigin>
export function resolveImageTag(requested: string | undefined, bakedVersion: string): string
export function writeAssets(projectDir: string, assetsDir: string): Promise<void>
export const releasedComposeHashes: readonly string[]
```

Rules the tests pin:
- `detectFormat`: no `compose.yml` → `'fresh'` (a lone `.env` is a fresh directory with prepared answers); `compose.yml` without a numeric `MAILER_FORMAT_VERSION` in `.env` → `0`; otherwise that number.
- `composeOrigin` compares sha256 over the content with CRLF normalised to LF: equal to the asset → `'current'`, in `releasedComposeHashes` → `'released'`, else `'edited'`.
- `resolveImageTag`: a requested tag other than `latest` is returned as is; `undefined` or `latest` returns `bakedVersion`; if that is `0.0.0-dev`, throw `CliError` with `EXIT.usage` and the message `This image carries no release version; pass --image-tag <version>.`
- `writeAssets` copies `compose.yml` and `mailer.sh` (mode `0o755`) from `assetsDir`, each through a temporary file and a rename.

- [ ] **Step 1: Write the failing spec** with one test per rule above, each in a `mkdtemp` directory, with `assetsDir` pointing at a second temporary directory holding a two-line `compose.yml` and `mailer.sh`. Include:

```ts
it('writeAssets leaves no temporary file and makes mailer.sh executable', async () => {
    await writeAssets(projectDir, assetsDir)
    expect((await readdir(projectDir)).sort()).toEqual(['compose.yml', 'mailer.sh'])
    if (process.platform !== 'win32') {
        expect((await stat(join(projectDir, 'mailer.sh'))).mode & 0o111).not.toBe(0)
    }
})
it('resolveImageTag refuses to pin a development image', () => {
    expect(() => resolveImageTag('latest', '0.0.0-dev')).toThrow(CliError)
    expect(resolveImageTag('latest', '1.2.3')).toBe('1.2.3')
    expect(resolveImageTag('ci', '1.2.3')).toBe('ci')
})
```

- [ ] **Step 2: Run and see it fail.** `pnpm --filter mailer-cli exec vitest run src/project.spec.ts`

- [ ] **Step 3: Fill `legacy-templates.ts`.** For each of the tags `v0.0.1`, `0.0.2`, `v0.0.3`, `v0.0.4`, `v0.0.5`, read the file with `git show <tag>:deploy/compose.yml` (read-only; skip a tag that has no such file), normalise CRLF to LF and record its sha256 hex. Also add the hash of `deploy/compose.yml` as it is before Task 5 changes it.

- [ ] **Step 4: Implement `project.ts`.**

- [ ] **Step 5: Verify.** `pnpm --filter mailer-cli test`, `typecheck`, `lint` → pass.

---

### Task 3: The `setup` command

**Files:**
- Create: `packages/cli/src/prompter.ts`, `src/commands/setup.ts`
- Test: `packages/cli/src/commands/setup.spec.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces:

```ts
export interface Prompter {
    text(options: { message: string; initial?: string; validate?: (value: string) => string | undefined }): Promise<string>
    select<T extends string>(options: { message: string; options: { value: T; label: string }[]; initial?: T }): Promise<T>
    confirm(options: { message: string; initial: boolean }): Promise<boolean>
    note(message: string): void
}
export function createClackPrompter(): Prompter

export interface HostResolver {
    resolve4(name: string): Promise<string[]>
    resolve6(name: string): Promise<string[]>
}

export type SecretsMode = 'generate' | 'prompt' | 'external'
export interface SetupOptions {
    yes: boolean
    imageTag?: string
    siteAddress?: string
    mailHostname?: string
    mailIpv4?: string
    mailIpv6?: string
    secrets?: SecretsMode
    secretsWrapper?: string
}
export interface SetupResult {
    generated: SecretKey[]
    legacyComposeKept: boolean
}
export function runSetup(ctx: CliContext, options: SetupOptions, prompter: Prompter, resolver: HostResolver): Promise<SetupResult>
```

Behaviour (the spec's "Setup" and "Secrets" sections):
- A value comes from, in order: the option, the existing `.env`, a prompt. Prompts happen only when `ctx.interactive && !options.yes`; otherwise a missing `SITE_ADDRESS`, `MAIL_HOSTNAME` or `MAIL_SERVER_IPV4` throws `CliError` (`EXIT.usage`) naming every missing key in one message.
- Checks on every path: `MAIL_HOSTNAME` differs from `SITE_ADDRESS`; `MAIL_SERVER_IPV4` passes `net.isIPv4`; a given `MAIL_SERVER_IPV6` passes `net.isIPv6`. Violations throw `CliError` (`EXIT.usage`).
- Interactive only: the resolver's first A record of `MAIL_HOSTNAME` is the default for IPv4 and its first AAAA record for the optional IPv6; a name that does not resolve produces a `note` warning and no failure; the registrable-domain warning from `apps/docs/installation/index.md` is shown with the `MAIL_HOSTNAME` prompt. A resolver error counts as "does not resolve".
- Secrets mode defaults to the existing state: `external` when `.env` has `MAILER_SECRETS_WRAPPER`, else `generate`.
    - `generate`: every secret that is empty in `.env` gets `generateSecret()`; a set one is never touched. `out('Generated <KEY> in .env.')` per generated key.
    - `prompt` (interactive only): each empty secret is asked for, validated with `typedSecretProblem`; an empty answer generates it.
    - `external`: no secret is written to `.env`; `MAILER_SECRETS_WRAPPER` is the option, the existing value or a prompt; missing in a non-interactive run → `CliError` (`EXIT.usage`). Interactively the user may have the four values generated and shown once through `note`.
- No path offers to change a secret that is already set.
- `DB_DATABASE` and `DB_USERNAME` default to `mailer` when absent. `IMAGE_TAG` is `resolveImageTag(options.imageTag ?? existing IMAGE_TAG, ctx.bakedVersion)`. `MAILER_FORMAT_VERSION` is `CURRENT_FORMAT`.
- Format 0: when `composeOrigin` is `'edited'`, the file is renamed to `compose.yml.legacy` and `legacyComposeKept` is `true`, with a `note` that the differences belong in `compose.override.yml`. A leftover `setup.sh` is removed.
- Everything is collected first and written at the end: `writeAssets`, then `.env`. A prompt that is cancelled throws `CliError('Setup cancelled.')` before anything is written.

- [ ] **Step 1: Write the failing spec.** Use a scripted fake `Prompter` (typed `Mock`s that answer from a queue and throw when the queue is empty) and a fake `HostResolver`. Tests, each in a `mkdtemp` directory:

```ts
it('with a filled .env and --yes it asks nothing, keeps the secrets and writes the project files', async () => {
    await writeFile(join(projectDir, '.env'), filledEnv)
    const result = await runSetup(ctx({ interactive: false }), { yes: true, imageTag: 'ci' }, prompter, resolver)
    const env = await EnvFile.read(join(projectDir, '.env'))
    expect(prompter.text).not.toHaveBeenCalled()
    expect(result.generated).toEqual([])
    expect(env.get('DB_PASSWORD')).toBe('existing-db-password')
    expect(env.get('IMAGE_TAG')).toBe('ci')
    expect(env.get('MAILER_FORMAT_VERSION')).toBe('1')
    expect(await readFile(join(projectDir, 'compose.yml'), 'utf8')).toBe(assetCompose)
})
it('generates only the empty secrets and reports them', ...)        // MAIL_PASSWORD= emptied → generated: ['MAIL_PASSWORD'], out line 'Generated MAIL_PASSWORD in .env.'
it('names every missing key in a non-interactive run', ...)          // rejects with exitCode 2, message contains SITE_ADDRESS, MAIL_HOSTNAME and MAIL_SERVER_IPV4
it('refuses MAIL_HOSTNAME equal to SITE_ADDRESS', ...)               // exitCode 2
it('offers the resolved addresses as defaults in the wizard', ...)   // resolver returns ['203.0.113.10'] → text() called with initial '203.0.113.10'
it('warns and continues when a name does not resolve', ...)          // resolver rejects → note() called, setup succeeds
it('accepts a typed secret and refuses one with a dollar sign', ...) // validate callback returns a message for 'abc$…'
it('external mode writes the wrapper and no secret', ...)            // .env has MAILER_SECRETS_WRAPPER, has('DB_PASSWORD') false
it('external mode without a wrapper fails in a non-interactive run', ...) // exitCode 2
it('keeps an edited compose.yml as compose.yml.legacy and removes setup.sh', ...)
it('overwrites a compose.yml that equals a released template without a .legacy copy', ...)
it('writes nothing when the wizard is cancelled', async () => {
    prompter.text.mockRejectedValueOnce(new CliError('Setup cancelled.'))
    await expect(runSetup(ctx({ interactive: true }), { yes: false }, prompter, resolver)).rejects.toThrow('Setup cancelled.')
    expect(await readdir(projectDir)).toEqual([])
})
it('pins the baked version when started from latest', ...)           // imageTag 'latest', bakedVersion '1.4.0' → IMAGE_TAG=1.4.0
```

- [ ] **Step 2: Run and see it fail.** `pnpm --filter mailer-cli exec vitest run src/commands/setup.spec.ts`

- [ ] **Step 3: Implement `prompter.ts` and `commands/setup.ts`.** `createClackPrompter` maps `@clack/prompts`' cancel symbol to `throw new CliError('Setup cancelled.')`.

- [ ] **Step 4: Verify.** `pnpm --filter mailer-cli test`, `typecheck`, `lint` → pass.

---

### Task 4: `migrate-project`, `recovery-kit` and the command line

**Files:**
- Create: `packages/cli/src/migrations/index.ts`, `src/commands/migrate-project.ts`, `src/commands/recovery-kit.ts`, `src/main.ts`, `src/bin.ts`
- Create: `packages/cli/test/fixtures/format-1/.env`, `compose.yml`, `mailer.sh`
- Test: `packages/cli/src/commands/migrate-project.spec.ts`, `src/commands/recovery-kit.spec.ts`, `src/main.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:

```ts
export interface ProjectMigration {
    from: number
    run(projectDir: string, env: EnvFile): Promise<void>
}
export const projectMigrations: readonly ProjectMigration[]

export interface MigrateOptions { imageTag: string; dryRun: boolean }
export interface MigrateResult { from: number; to: number; snapshotDir: string | undefined }
export function migrateProject(ctx: CliContext, options: MigrateOptions, migrations?: readonly ProjectMigration[]): Promise<MigrateResult>

export function recoveryKit(ctx: CliContext): Promise<string[]>

export interface MainDeps { prompter: Prompter; resolver: HostResolver; out: (line: string) => void; err: (line: string) => void }
export function run(argv: string[], env: Record<string, string | undefined>, deps: MainDeps): Promise<number>
```

`migrateProject`:
1. `detectFormat`. `'fresh'` or `0` → `CliError` with `EXIT.manual`: `This directory was not set up by mailer.sh; run: sh mailer.sh setup`. A format above `CURRENT_FORMAT` → `EXIT.manual`: `This installation is newer than the image; a downgrade is not supported.` A missing migration for a step → `EXIT.manual`. All of these happen before any write.
2. `dryRun` returns here with `snapshotDir: undefined`.
3. Take the lock with `mkdir .update-lock` (not recursive). If it exists → `CliError`: `Another update is running. If none is, remove .update-lock and try again.`
4. Copy `compose.yml`, `.env` and `mailer.sh` to `backups/snapshots/<YYYYMMDDTHHMMSSZ>/` (directories mode `0o700`).
5. Run the migrations from the detected format upward, `writeAssets`, set `MAILER_PREVIOUS_IMAGE_TAG` to the old `IMAGE_TAG` when the tag changes, `IMAGE_TAG` to `options.imageTag`, `MAILER_FORMAT_VERSION` to `CURRENT_FORMAT`, write `.env`. `out('Snapshot: backups/snapshots/<name>')`.
6. If step 5 throws: put the three files back from the snapshot, remove the lock, rethrow. On success the lock stays; the launcher removes it.

`recoveryKit` returns the lines to print: site, mail hostname, version (`IMAGE_TAG`), the four secrets and `Encryption secret fingerprint: <secretFingerprint>`. Each secret comes from `ctx.env` first, then `.env`; a missing one is shown as `(not available)`.

`run` — commands and options (`parseArgs`, strict):
- `setup [--yes] [--image-tag <t>] [--site-address <v>] [--mail-hostname <v>] [--mail-ipv4 <v>] [--mail-ipv6 <v>] [--secrets generate|prompt|external] [--secrets-wrapper <cmd>]`; afterwards prints the recovery kit when `result.generated` is not empty, followed by `Store this recovery kit in a password manager. A database backup is worthless without BACKEND_ENCRYPTION_SECRET.`
- `migrate-project --image-tag <t> [--dry-run]`
- `recovery-kit`
- `--version` prints `bakedVersion`.
- `projectDir` is `env.MAILER_PROJECT_DIR ?? '/project'`, `assetsDir` is `env.MAILER_ASSETS_DIR ?? join(import.meta.dirname, 'assets')`, `bakedVersion` is `env.MAILER_VERSION ?? '0.0.0-dev'`, `interactive` is `process.stdin.isTTY && process.stdout.isTTY`.
- A `CliError` prints its message through `err` and returns its `exitCode`; an unknown command or option returns `EXIT.usage`; any other error prints its message and returns `EXIT.failure`. `bin.ts` sets `process.exitCode` from `run`.

- [ ] **Step 1: Create the fixture** `test/fixtures/format-1/`: a `.env` with `MAILER_FORMAT_VERSION=1`, `IMAGE_TAG=1.0.0`, the three required settings, four dummy secrets and one foreign line `CUSTOM_KEY=keep`; `compose.yml` and `mailer.sh` each a one-line placeholder that differs from the assets.

- [ ] **Step 2: Write the failing specs.**

```ts
it.each(await fixtureNames())('migrates the %s fixture to the current format', async (name) => {
    await cp(join(fixturesDir, name), projectDir, { recursive: true })
    const result = await migrateProject(ctx(), { imageTag: '9.9.9', dryRun: false })
    const env = await EnvFile.read(join(projectDir, '.env'))
    expect(result.to).toBe(CURRENT_FORMAT)
    expect(env.get('MAILER_FORMAT_VERSION')).toBe(String(CURRENT_FORMAT))
    expect(env.get('IMAGE_TAG')).toBe('9.9.9')
    expect(env.get('MAILER_PREVIOUS_IMAGE_TAG')).toBe('1.0.0')
    expect(env.get('CUSTOM_KEY')).toBe('keep')
    expect(await readFile(join(projectDir, 'compose.yml'), 'utf8')).toBe(assetCompose)
    expect(await readFile(join(result.snapshotDir!, 'compose.yml'), 'utf8')).toBe(fixtureCompose)
    expect(existsSync(join(projectDir, '.update-lock'))).toBe(true)
})
it('--dry-run changes nothing and takes no lock', ...)
it('reports manual action for a directory mailer.sh did not set up', ...)   // exitCode 3, directory listing unchanged
it('reports manual action for a format newer than the image', ...)          // MAILER_FORMAT_VERSION=99 → exitCode 3
it('refuses a second run while the lock exists and leaves it', ...)
it('restores the snapshot and releases the lock when a migration throws', async () => {
    const failing: ProjectMigration = { from: 1, run: () => Promise.reject(new Error('boom')) }
    ...migrateProject(ctx(), { imageTag: '9.9.9', dryRun: false }, [failing]) with MAILER_FORMAT_VERSION=1 and CURRENT_FORMAT stubbed…
})
```

For the last test export a second entry point from `migrate-project.ts` that takes the target format as a parameter, so the spec can drive a 1 → 2 migration without changing `CURRENT_FORMAT`; `migrateProject` calls it with `CURRENT_FORMAT`. Assert the three files equal their state before the run and `.update-lock` is gone.

`recovery-kit.spec.ts`: secrets come from `ctx.env` before `.env`; a missing one prints `(not available)`; the fingerprint line equals `secretFingerprint` of the encryption secret.

`main.spec.ts`: `run(['migrate-project'], …)` without `--image-tag` returns `2`; `run(['nope'], …)` returns `2`; a `CliError` with `EXIT.manual` returns `3` and its message goes to `err`; `run(['--version'], { MAILER_VERSION: '1.4.0' }, …)` prints `1.4.0`; `setup --yes` on a filled `.env` returns `0` and prints no recovery kit, with one secret emptied it prints the kit.

- [ ] **Step 3: Run and see them fail.** `pnpm --filter mailer-cli test`

- [ ] **Step 4: Implement** `migrations/index.ts` (an empty array), `commands/migrate-project.ts`, `commands/recovery-kit.ts`, `main.ts`, `bin.ts`.

- [ ] **Step 5: Verify.** `pnpm --filter mailer-cli test`, `typecheck`, `lint`, `build`; then `MAILER_VERSION=1.4.0 node packages/cli/dist/mailer.js --version` prints `1.4.0`.

---

### Task 5: Compose secrets and the image

**Files:**
- Modify: `deploy/compose.yml` (the `backend.environment` block, lines 69–89)
- Modify: `Dockerfile`, `.dockerignore`
- Delete: `deploy/.env.example`
- Modify: `e2e/smoke/stack.spec.ts` (describe `compose configuration`)

**Interfaces — Produces:** an image in which `mailer` is on `PATH`, `/app/cli/mailer.js` is the bundle, `/app/cli/assets/compose.yml` and `/app/cli/assets/mailer.sh` are copies of `deploy/`, and `MAILER_VERSION` is set from the build argument of the same name (default `0.0.0-dev`).

- [ ] **Step 1: Add a failing smoke check** in the describe `compose configuration`: with an env file whose `DB_PASSWORD`, `BACKEND_JWT_SECRET` and `BACKEND_ENCRYPTION_SECRET` lines are removed and the three values passed through the process environment instead, `docker compose … config --format json` shows exactly those values under `services.backend.environment`. Extend `Compose` in `e2e/smoke/support/compose.ts` with `config(envFile: string, env: Record<string, string>): Promise<{ services: Record<string, { environment?: Record<string, string> }> }>` for it.

- [ ] **Step 2: Change `deploy/compose.yml`.** Add to `backend.environment`:

```yaml
DB_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD is required}
BACKEND_JWT_SECRET: ${BACKEND_JWT_SECRET:?BACKEND_JWT_SECRET is required}
BACKEND_ENCRYPTION_SECRET: ${BACKEND_ENCRYPTION_SECRET:?BACKEND_ENCRYPTION_SECRET is required}
```

- [ ] **Step 3: Change the image.** `.dockerignore`: drop the `deploy` line, add `deploy/.env`. `Dockerfile`: build the CLI in the `build` stage (`pnpm turbo run build --filter=frontend --filter=mailer-cli`); in the `backend` stage, before `USER node`: `ARG MAILER_VERSION=0.0.0-dev`, `ENV MAILER_VERSION=${MAILER_VERSION}`, copy `/repo/packages/cli/dist/mailer.js` to `/app/cli/mailer.js` and `/repo/deploy/compose.yml` and `/repo/deploy/mailer.sh` to `/app/cli/assets/`, and create `/usr/local/bin/mailer` as an executable two-line `sh` script that runs `exec node /app/cli/mailer.js "$@"`. Until Task 6 creates `deploy/mailer.sh`, create it as a one-line placeholder so the image builds.

- [ ] **Step 4: Delete `deploy/.env.example`** and remove every reference outside `apps/docs` and the markdown files Task 9 owns (`grep -rn "deploy/.env.example\|\.env\.example" --include=*.ts --include=*.yml --include=*.json .`; the root `.env.example` stays).

- [ ] **Step 5: Verify.**

```bash
docker build -t ghcr.io/schwarzdavid/mailer:local --build-arg MAILER_VERSION=9.9.9 .
docker run --rm ghcr.io/schwarzdavid/mailer:local mailer --version
```

Expected: `9.9.9`. Then `docker run --rm --user 12345:12345 -e HOME=/tmp ghcr.io/schwarzdavid/mailer:local mailer --version` prints the same (an arbitrary uid works), and `docker run --rm ghcr.io/schwarzdavid/mailer:local ls /app/cli/assets` lists `compose.yml` and `mailer.sh`. The smoke check of Step 1 runs with Task 7.

---

### Task 6: The launcher `deploy/mailer.sh`

**Files:**
- Create: `deploy/mailer.sh` (replaces the placeholder)
- Delete: `deploy/setup.sh`
- Test: `packages/cli/test/launcher.spec.ts`
- Modify: `packages/cli/vitest.config.ts` if `test/**/*.spec.ts` is not yet included

**Interfaces:**
- Consumes: the CLI commands of Task 4 and the frozen contract in Global Constraints.
- Produces — commands of `sh mailer.sh <command>`:

| Command | Does |
| --- | --- |
| `setup [options…]` | runs `mailer setup --image-tag <tag> [options…]` in the image, then `_post-setup` |
| `start`, `stop`, `restart`, `status` | `docker compose up -d`, `stop`, `restart`, `ps` |
| `logs [args…]`, `compose [args…]` | `docker compose logs …`, `docker compose …` |
| `token` | prints the last setup token from `docker compose logs backend`, 32 hex characters, or fails with `No setup token in the backend log; a user already exists or the backend has not started.` |
| `version` | prints `IMAGE_TAG` and `MAILER_FORMAT_VERSION` |
| `doctor` | checks the Compose version, that `.env` exists and that the required settings and the four secrets are available; prints one line per check and exits non-zero on the first failure |
| `recovery-kit` | runs `mailer recovery-kit` in the image |
| `update [major] --to <version>` | see below |
| `_post-setup`, `_finish-update <from> <to>` | internal |
| `help`, no command | usage |

Decisions the implementer cannot make alone:
- The script `cd`s into its own directory first. The mount source is `$(pwd -W 2>/dev/null || pwd)`, so Git Bash passes `C:/…` and Linux its normal path; every use is double-quoted.
- The image tag for `setup` and `recovery-kit` is `IMAGE_TAG` from `.env`, or `latest` when there is none. Only `latest` is pulled before the run.
- `docker run` gets `-t` only when stdin and stdout are terminals. `setup` and `recovery-kit` add `-e <KEY>` (name only) for each of the four secrets.
- Compose must be at least `2.23.1` (`docker compose version --short`); otherwise fail with `mailer.sh: Docker Compose 2.23.1 or newer is required (found <version>).`
- **Secrets wrapper.** For every command except `setup`, `version` and `help`: when `MAILER_SECRETS_WRAPPER` in `.env` is not empty and `MAILER_WRAPPED` is unset, the launcher re-executes itself under the wrapper with `MAILER_WRAPPED=1`. If the wrapper contains `{}`, that token is replaced by the re-execution command as one single-quoted word (inner single quotes escaped); otherwise the command is appended as separate quoted words. The result is run with `eval`.
- A secret is read from the environment first and from `.env` second. Before any `docker compose up`, a missing secret fails with `mailer.sh: <KEY> is not set` plus `; the secrets wrapper did not provide it` when wrapped.
- `_post-setup`: Compose version check, secrets check, `docker compose up -d --pull missing`, then the mailbox loop of today's `setup.sh` (wait up to 10 minutes, same messages: `Created the mailbox …`, `Updated the password of …`, `Created the alias … -> …`). The password goes to `setup email add|update <address>` on stdin, as two lines, never as an argument. Ends with `mailer runs at https://<SITE_ADDRESS>. Setup token for the first login: sh mailer.sh token`.
- `update [major] --to <version>`: a leading `v` is stripped. Without `--to` it fails with `mailer.sh: this version needs a target: sh mailer.sh update --to <version>`. Equal to `IMAGE_TAG` → `Already on <version>.`, exit 0. When both tags are `N.N.N…` and their first numbers differ and `major` was not given → fail with `mailer.sh: <version> is a new major version. Read its release notes, then run: sh mailer.sh update major --to <version>`. Then `docker pull`; a failed pull is fatal unless the image exists locally. Then the frozen `docker run … mailer migrate-project --image-tag <version>`: exit `3` → exit `3` with the CLI's message; other non-zero → exit `1`; `0` → `exec sh ./mailer.sh _finish-update <from> <version>`. There is no `docker compose pull`: the backend image is already there, the other images are pinned by tag, and a blanket pull would fail for an image that only exists locally.
- `_finish-update <from> <to>`: a trap removes `.update-lock` on every exit. `docker compose up -d --pull missing --remove-orphans`, `docker compose up -d --wait --wait-timeout 300 backend`, mailbox check, `Updated from <from> to <to>.` On failure: `mailer.sh: the update to <to> did not come up. The previous files are in backups/snapshots/; see the rollback page of the documentation.` and exit 1. (Automatic rollback is project 2.)

- [ ] **Step 1: Write the fake docker and the failing spec.** The spec creates a temporary install directory **whose path contains a space**, copies `deploy/mailer.sh` into it, writes an executable `docker` stub into a temporary `bin` directory and runs `sh mailer.sh …` through `execa` with that `bin` first on `PATH`. `describe.skipIf` when no `sh` is on `PATH`. The stub: appends its arguments as one line to `$FAKE_LOG`; prints `${FAKE_COMPOSE_VERSION:-2.30.0}` for `compose version --short`; appends its stdin to `$FAKE_STDIN` for calls containing `setup email`; before logging a `compose up` call appends `env DB_PASSWORD=$DB_PASSWORD`; exits 1 for calls matching the extended regex `$FAKE_FAIL` when set; exits `${FAKE_CLI_EXIT:-0}` for `run … mailer …` calls; for `run … mailer migrate-project …` with exit 0 it does nothing else. In the tests where that run succeeds, the spec pre-creates `.update-lock` to stand in for the CLI; in the others it does not.

```ts
it('start, stop, restart, status, logs and compose map to docker compose', ...)   // log lines: 'compose up -d', 'compose stop', 'compose restart', 'compose ps', 'compose logs -f backend', 'compose config'
it('setup runs the CLI with the frozen mount and user, then starts the stack', ...) // one log line matches /^run --rm -i --user \d+:\d+ -e HOME=\/tmp .* -v .+:\/project ghcr\.io\/schwarzdavid\/mailer:1\.0\.0 mailer setup --image-tag 1\.0\.0 --yes$/ and a later line is 'compose up -d --pull missing'
it('setup uses and pulls latest in an empty directory', ...)                        // 'pull ghcr.io/schwarzdavid/mailer:latest' before the run line
it('passes the mailbox password on stdin and never as an argument', ...)            // FAKE_STDIN contains the password twice; no log line contains it
it('refuses an old Compose', ...)                                                   // FAKE_COMPOSE_VERSION=2.20.0 → exit 1, stderr contains '2.23.1 or newer'
it('fails before starting when a secret is missing', ...)                           // DB_PASSWORD emptied → stderr 'DB_PASSWORD is not set', no 'compose up' line
it('runs under the secrets wrapper and hands its secrets to compose', ...)          // .env without DB_PASSWORD, MAILER_SECRETS_WRAPPER=sh ./wrap.sh; wrap.sh exports DB_PASSWORD=from-wrapper and execs "$@" → log has 'env DB_PASSWORD=from-wrapper'
it('replaces {} in the wrapper with one quoted command', ...)                       // MAILER_SECRETS_WRAPPER=sh ./one.sh {}; one.sh records $# → 1
it('update needs --to', ...)
it('update to the running version changes nothing', ...)                           // stdout 'Already on 1.0.0.', no 'pull' line
it('update refuses another major without the major command', ...)                  // --to 2.0.0 → exit 1, no 'pull' line; 'update major --to 2.0.0' proceeds
it('update strips a leading v and hands over to _finish-update', ...)              // run line ends 'mailer migrate-project --image-tag 1.1.0'; later 'compose up -d --pull missing --remove-orphans', 'compose up -d --wait --wait-timeout 300 backend'; stdout 'Updated from 1.0.0 to 1.1.0.'; .update-lock gone
it('update stops with exit 3 and changes nothing when the CLI needs manual action', ...) // FAKE_CLI_EXIT=3 → exit 3, no 'compose up' line
it('update fails when the image cannot be pulled and leaves no lock', ...)         // FAKE_FAIL='^(pull|image inspect)' → exit 1, no 'run' line, no .update-lock
it('_finish-update removes the lock when the stack does not come up', ...)         // FAKE_FAIL='--wait' → exit 1, stderr names backups/snapshots/, .update-lock gone
it('token prints the last setup token', ...)                                       // stub prints two 'Setup token: <hex>' log lines for 'compose logs backend' via $FAKE_LOGS file → stdout is the second
```

- [ ] **Step 2: Run and see it fail.** `pnpm --filter mailer-cli exec vitest run test/launcher.spec.ts`

- [ ] **Step 3: Write `deploy/mailer.sh`** and delete `deploy/setup.sh`.

- [ ] **Step 4: Verify.** `pnpm --filter mailer-cli test` → pass. If `shellcheck` is installed: `shellcheck -s sh deploy/mailer.sh` → no findings. `grep -rn "setup\.sh" --include=*.ts --include=*.yml --include=*.json . | grep -v node_modules` → only `e2e/smoke` (Task 7) and the CLI's own removal of a leftover `setup.sh`.

---

### Task 7: Smoke suite on `mailer.sh`

**Files:**
- Modify: `e2e/smoke/support/stack.ts`, `e2e/smoke/support/compose.ts`, `e2e/smoke/stack.spec.ts`

**Interfaces:**
- Consumes: the image of Task 5 and the launcher of Task 6.
- Produces: `runLauncher(stack: SmokeStack, args: string[], options?: { reject?: boolean }): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }>` replacing `runSetup`; `SmokeStack.launcherFile` replacing `setupFile`; `SmokeStack.overrideFile` now `compose.override.yml`.

- [ ] **Step 1: Adapt the helpers.** `prepareStack` copies `deploy/mailer.sh` instead of `setup.sh` and writes the smoke override as `compose.override.yml`, the operator's file, so the launcher needs no `COMPOSE_FILE`. `runLauncher` runs `sh mailer.sh …` in the stack directory with `COMPOSE_PROJECT_NAME` and `MSYS_NO_PATHCONV=1`. `destroyStack` also removes the image tag `ghcr.io/schwarzdavid/mailer:smoke-next` (ignoring a failure).

- [ ] **Step 2: Rewrite the two `setup.sh` tests** in the describe `mail server` and add the checks that belong to that state:

```ts
it('mailer.sh setup adopts the directory, starts mail and creates the bounce account and the postmaster alias', async () => {
    const { stdout } = await runLauncher(current(), ['setup', '--yes'])
    expect(stdout).not.toContain('Generated')
    expect(stdout).toContain(`Created the mailbox bounce@${MAIL_HOSTNAME}.`)
    expect(stdout).toContain(`Created the alias postmaster@${MAIL_HOSTNAME} -> bounce@${MAIL_HOSTNAME}.`)
    const env = await readFile(current().envFile, 'utf8')
    expect(envValue(env, 'MAILER_FORMAT_VERSION')).toBe('1')
    expect(envValue(env, 'IMAGE_TAG')).toBe(imageTag)
    expect(await readFile(current().composeFile, 'utf8')).toBe(await readFile(sourceComposeFile, 'utf8'))
    expect(existsSync(join(current().dir, 'compose.yml.legacy'))).toBe(false)
    expect(await compose.waitHealthy('mail', 120_000)).toBe(true)
})
it('mailer.sh setup run again with an emptied MAIL_PASSWORD generates a new one and rotates it for mail and backend', ...)
// as today, with 'Generated MAIL_PASSWORD in .env.', the recovery kit's 'Store this recovery kit in a password manager.' in place of the 'Back up .env now' line, and readiness 200 afterwards
it('mailer.sh token prints the setup token the backend logged', async () => {
    const { stdout } = await runLauncher(current(), ['token'])
    expect(stdout.trim()).toMatch(/^[0-9a-f]{32}$/)
    expect(stdout.trim()).toBe(setupTokenFrom(await compose.logs('backend')))
})
it('mailer.sh status lists the backend', ...)   // stdout contains 'backend'
```

The readiness check after the rotation is what proves the password reached docker-mailserver through stdin. If `setup email add` does not accept it that way, find the form that keeps it out of the argument list (docker-mailserver's `setup` help in the running container) and change Task 6's launcher and spec to match.

- [ ] **Step 3: Replace the describe `updates`.**

```ts
it('mailer.sh update hands over to the target image and replaces the backend', async () => {
    const oldId = await compose.containerId('backend')
    await execa('docker', ['tag', `${IMAGE}:${imageTag}`, `${IMAGE}:smoke-next`])
    const { stdout } = await runLauncher(current(), ['update', '--to', 'smoke-next'])
    expect(stdout).toContain(`Updated from ${imageTag} to smoke-next.`)
    const env = await readFile(current().envFile, 'utf8')
    expect(envValue(env, 'IMAGE_TAG')).toBe('smoke-next')
    expect(envValue(env, 'MAILER_PREVIOUS_IMAGE_TAG')).toBe(imageTag)
    const snapshots = await readdir(join(current().dir, 'backups', 'snapshots'))
    expect(snapshots).toHaveLength(1)
    expect((await readdir(join(current().dir, 'backups', 'snapshots', snapshots[0]!))).sort()).toEqual(['.env', 'compose.yml', 'mailer.sh'])
    expect(existsSync(join(current().dir, '.update-lock'))).toBe(false)
    expect(await compose.containerId('backend')).not.toBe(oldId)
    expect((await request(`${BASE_URL}/api/setup/status`)).status).toBe(200)
})
it('mailer.sh update to the running version changes nothing', ...)   // stdout 'Already on smoke-next.'
```

- [ ] **Step 4: Verify** from Git Bash:

```bash
docker build -t ghcr.io/schwarzdavid/mailer:local .
IMAGE_TAG=local pnpm --filter e2e test:smoke
pnpm --filter e2e typecheck && pnpm --filter e2e lint
```

Expected: the whole suite passes, including the Task 5 check in `compose configuration`.

---

### Task 8: Release pipeline

**Files:**
- Modify: `.github/workflows/ci.yml` (job `image`)

- [ ] **Step 1:** Pass the version to the build: add `build-args: MAILER_VERSION=${{ steps.meta.outputs.version }}` to the `docker/build-push-action` step. On a release that is the semver version, otherwise `sha-<7>`.
- [ ] **Step 2:** Attach the launcher as the job's last step, after the push, only on a release: `gh release upload "$TAG" deploy/mailer.sh --clobber` with `GH_TOKEN: ${{ github.token }}` and `TAG: ${{ github.event.release.tag_name }}`. Raise the job's `contents` permission to `write` for it. Being last is the point: a release has its `mailer.sh` only once its image exists.
- [ ] **Step 3: Verify.** `pnpm format` passes for the file. The pipeline itself can only be proven by a release; say so in the hand-over instead of claiming it ran.

---

### Task 9: Documentation

**Files:**
- Modify: `apps/docs/installation/index.md`, `installation/first-run-setup.md`, `installation/advanced-configuration.md`, `operations/updating.md`, `operations/rollback.md`, `operations/backup-restore.md`, `operations/troubleshooting.md`, `operations/security.md`, `operations/scaling.md`, `admin-guide/settings.md`, `index.md`
- Create: `apps/docs/operations/mailer-sh.md`; modify `apps/docs/.vitepress/sidebar.ts`
- Modify: `apps/docs/scripts/env-reference.ts` (allow-list)
- Modify: `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`

Content decisions:
- **Installation** becomes: prerequisites (unchanged), the three bootstrap lines from the spec, what the wizard asks, the recovery kit (replacing the "Back up .env now" box, same warning about `BACKEND_ENCRYPTION_SECRET`), `sh mailer.sh token`. A section "Unattended installation" shows a prepared `.env` with the keys of the deleted `deploy/.env.example` and `sh mailer.sh setup --yes`. The page no longer embeds `deploy/` files.
- **`operations/mailer-sh.md`** ("The mailer.sh command"): one section per command of Task 6's table, with the exact messages a reader will see.
- **Advanced configuration:** every instruction that says to edit `compose.yml` becomes a `compose.override.yml` snippet (`TRUST_PROXY`, `DB_HOST`/`DB_PORT`, `REDIS_HOST`/`REDIS_PORT`, the CA volume), with one paragraph saying that `compose.yml` and `mailer.sh` are replaced on every update. The compose-variables table gains `MAILER_FORMAT_VERSION`, `MAILER_PREVIOUS_IMAGE_TAG` and `MAILER_SECRETS_WRAPPER`. A new section "Secrets from a secret manager" explains the wrapper, the `{}` form written without quotes, examples for `op run`, `infisical run`, `doppler run` and `sops exec-env`, and that it is optional.
- **Updating** becomes `sh mailer.sh update --to <version>`: what it does, the major rule and `update major`, the snapshot in `backups/snapshots/`, what "needs manual action" means, the unchanged section on failing migrations. Keep the manual database dump as a step to do first; the automatic one comes with project 2, so do not promise it. **Rollback** takes the previous files from the snapshot instead of `compose.yml.before-update`.
- Everywhere else: `sh setup.sh` → `sh mailer.sh setup`, the token command → `sh mailer.sh token`.
- **`CLAUDE.md`:** eight workspaces with `packages/cli`; the `deploy/` paragraph describes `mailer.sh`, the image contents and the frozen contract; the smoke and testing notes name `mailer.sh` and `packages/cli/test/launcher.spec.ts`, and the note that `installation/index.md` embeds `deploy/` files goes; `.env.example` wording covers only the root file. Add to "Working agreement":

    > **Breaking changes ship their migration.** A change that could break an existing installation (the compose file, an environment variable, a volume, a host-side step in `mailer.sh`, the launcher contract, the database) ships in the same change with a project migration (`packages/cli/src/migrations`) or a database migration that an unattended update applies, a fixture of the old format under `packages/cli/test/fixtures`, and a test that migrates it. If it truly cannot be automated, `mailer migrate-project` must exit with "needs manual action" before changing anything, and the docs name the manual steps. The `docker run … mailer migrate-project --image-tag <tag>` call, its exit codes and `mailer.sh _finish-update <from> <to>` never change.

- [ ] **Step 1:** Add the three `MAILER_` keys to the allow-list in `apps/docs/scripts/env-reference.ts` and extend `apps/docs/scripts/__tests__/env-reference.spec.ts` if it enumerates the list.
- [ ] **Step 2:** Write `operations/mailer-sh.md` and add it to `sidebar.ts`.
- [ ] **Step 3:** Rewrite the installation, updating and rollback pages, then the remaining pages.
- [ ] **Step 4:** Update `README.md`, `CONTRIBUTING.md` and `CLAUDE.md`.
- [ ] **Step 5: Verify.** `grep -rn "setup\.sh\|\.env\.example" apps/docs README.md CONTRIBUTING.md CLAUDE.md` → only the root `.env.example` and the sentence about a leftover `setup.sh` being removed. `pnpm build --filter docs` and `pnpm --filter docs test` → pass (dead links, sidebar, H1 and env-reference checks).

---

### Task 10: Full gate

- [ ] **Step 1:** `pnpm check` → lint, typecheck, test and format pass across all workspaces.
- [ ] **Step 2:** From Git Bash: `docker build -t ghcr.io/schwarzdavid/mailer:local . && IMAGE_TAG=local pnpm --filter e2e test:smoke` → passes.
- [ ] **Step 3:** One interactive run by hand, which no test covers: in an empty directory, `sh mailer.sh setup` against the local image (`IMAGE_TAG=local` in a one-line `.env`), answer the wizard, and confirm the prompts, the DNS defaults, the recovery kit and a cancelled run (Ctrl-C leaves the directory as it was). Report what was seen; if it could not be run, say so.
