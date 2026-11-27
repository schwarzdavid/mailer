import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

interface LauncherResult {
    code: number | null
    stdout: string
    stderr: string
}

const launcherSource = process.env.LAUNCHER_SCRIPT ?? join(import.meta.dirname, '../../../deploy/mailer.sh')
const secretKeys = ['DB_PASSWORD', 'BACKEND_JWT_SECRET', 'BACKEND_ENCRYPTION_SECRET', 'MAIL_PASSWORD']
const secretNameFlags = secretKeys.flatMap((key) => ['-e', key])
const noLogFlags = ['--log-driver', 'none', ...secretNameFlags]
const inheritedKeysToDrop = [
    ...secretKeys,
    'MAILER_WRAPPED',
    'FAKE_FAIL',
    'FAKE_CLI_EXIT',
    'FAKE_CLI_STDERR',
    'FAKE_COMPOSE_VERSION',
    'FAKE_LOGS',
    'FAKE_DOVEADM_SILENT',
    'FAKE_CLI_WRITES_TAG',
    'FAKE_NEW_LAUNCHER',
    'FAKE_STUB_RECORD',
    'MAILER_SECRETS_WRAPPER',
    'IMAGE_TAG',
    'CDPATH',
]
const mailPassword = 'mail-secret-value'

const fakeDocker = `#!/bin/sh
line=$(printf '%s' "$*" | tr '\\n' ' ')
case "$line" in
    "compose up"*) printf 'env DB_PASSWORD=%s\\n' "\${DB_PASSWORD:-}" >>"$FAKE_LOG" ;;
esac
case "$line" in
    "compose version"*) ;;
    "compose "*) printf '%s|%s\\n' "\${IMAGE_TAG:-}" "$line" >>"$FAKE_IMAGE_TAGS" ;;
esac
printf '%s\\n' "$line" >>"$FAKE_LOG"
printf '[%s]' "$@" | tr '\\n' ' ' >>"$FAKE_ARGV"
printf '\\n' >>"$FAKE_ARGV"
if [ -n "\${FAKE_FAIL:-}" ] && printf '%s\\n' "$line" | grep -Eq -e "$FAKE_FAIL"; then
    exit 1
fi
case "$line" in
    "compose version --short") printf '%s\\n' "\${FAKE_COMPOSE_VERSION:-2.30.0}" ;;
    "compose logs"*) if [ -n "\${FAKE_LOGS:-}" ]; then cat "$FAKE_LOGS"; fi ;;
    "compose exec -T mail sh -c "*) PATH="$FAKE_MAIL_BIN:$PATH" exec sh -c "$7" "$8" "$9" "$FAKE_ACCOUNTS" "\${11}" ;;
    "run "*" mailer "*)
        if [ -n "\${FAKE_CLI_STDERR:-}" ]; then printf '%s\\n' "$FAKE_CLI_STDERR" >&2; fi
        cli_exit=\${FAKE_CLI_EXIT:-0}
        case "$line" in
            *" mailer migrate-project --image-tag "*)
                if [ "$cli_exit" = 0 ]; then
                    eval "cli_target=\\\${$#}"
                    cli_target=\${FAKE_CLI_WRITES_TAG:-$cli_target}
                    sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$cli_target/" .env
                    mkdir -p .update-lock
                    if [ -n "\${FAKE_NEW_LAUNCHER:-}" ]; then
                        cp "$FAKE_NEW_LAUNCHER" mailer.sh.next
                        mv mailer.sh.next mailer.sh
                    fi
                fi
                ;;
        esac
        exit "$cli_exit"
        ;;
esac
exit 0
`

const fakeDoveadm = `#!/bin/sh
printf '%s\\n' "$*" >>"$FAKE_DOVEADM_ARGV"
cat >>"$FAKE_STDIN"
if [ -n "\${FAKE_DOVEADM_SILENT:-}" ]; then
    exit 0
fi
printf '%s\\n' '{SHA512-CRYPT}$6$fake'
`

const recordingStub = [
    '#!/bin/sh',
    '{',
    '    printf \'args=%s\\n\' "$*"',
    '    printf \'pwd=%s\\n\' "$(pwd)"',
    '    printf \'IMAGE_TAG=%s\\n\' "${IMAGE_TAG:-}"',
    '    printf \'MAILER_WRAPPED=%s\\n\' "${MAILER_WRAPPED:-}"',
    '} >"$FAKE_STUB_RECORD"',
    '',
].join('\n')

const recordingWrapper =
    '#!/bin/sh\nprintf \'%s\\n\' "${X:-}" >>wrapper.ran\nDB_PASSWORD=from-wrapper\nexport DB_PASSWORD\nexec "$@"\n'

const releasedLauncher = launcherSource

function recorded(args: string[]): string {
    return args.map((arg) => `[${arg}]`).join('')
}

const defaultEnv: Record<string, string> = {
    IMAGE_TAG: '1.0.0',
    MAILER_FORMAT_VERSION: '1',
    SITE_ADDRESS: 'mail.example.com',
    MAIL_HOSTNAME: 'mx.example.com',
    MAIL_SERVER_IPV4: '203.0.113.10',
    DB_PASSWORD: 'db-secret-value',
    BACKEND_JWT_SECRET: 'jwt-secret-value',
    BACKEND_ENCRYPTION_SECRET: 'encryption-secret-value',
    MAIL_PASSWORD: mailPassword,
}

function findShell(): string | undefined {
    const directories = (process.env[pathKey()] ?? '').split(delimiter).filter((entry) => entry !== '')
    const name = process.platform === 'win32' ? 'sh.exe' : 'sh'
    const candidates = [...directories, ...directories.map((entry) => join(entry, '..', 'usr', 'bin'))]
    return candidates.map((entry) => join(entry, name)).find((candidate) => existsSync(candidate))
}

function pathKey(): string {
    return Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH'
}

const shell = process.env.LAUNCHER_SHELL ?? findShell()

describe.skipIf(shell === undefined)('mailer.sh', { timeout: 60_000 }, () => {
    let rootDir: string
    let installDir: string
    let binDir: string
    let logFile: string
    let argvFile: string
    let stdinFile: string
    let mailBinDir: string
    let doveadmArgvFile: string
    let accountsFile: string
    let imageTagsFile: string
    let mountSource: string
    let user: string

    function shellOutput(script: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const child = spawn(shell!, ['-c', script], { cwd: installDir, stdio: ['ignore', 'pipe', 'inherit'] })
            let stdout = ''
            child.stdout.on('data', (chunk: Buffer) => {
                stdout += chunk.toString()
            })
            child.on('error', reject)
            child.on('close', () => resolve(stdout.replace(/\r?\n$/, '')))
        })
    }

    function cliRun(tag: string, secretFlags: string[], cliArgs: string[]): string {
        return recorded([
            'run',
            '--rm',
            '-i',
            '--user',
            user,
            '-e',
            'HOME=/tmp',
            ...secretFlags,
            '-v',
            `${mountSource}:/project`,
            `ghcr.io/schwarzdavid/mailer:${tag}`,
            'mailer',
            ...cliArgs,
        ])
    }

    function migrateRun(tag: string): string {
        return cliRun(tag, [], ['migrate-project', '--image-tag', tag])
    }

    async function argvCalls(): Promise<string[]> {
        if (!existsSync(argvFile)) {
            return []
        }
        return (await readFile(argvFile, 'utf8')).split('\n').filter((line) => line !== '')
    }

    async function argvCallsWithoutVersion(): Promise<string[]> {
        return (await argvCalls()).filter((call) => call !== recorded(['compose', 'version', '--short']))
    }

    async function writeEnv(values: Record<string, string>): Promise<void> {
        const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`)
        await writeFile(join(installDir, '.env'), `${lines.join('\n')}\n`)
    }

    async function writeInstallFile(name: string, content: string): Promise<void> {
        await writeFile(join(installDir, name), content)
    }

    async function logLines(): Promise<string[]> {
        if (!existsSync(logFile)) {
            return []
        }
        return (await readFile(logFile, 'utf8')).split('\n').filter((line) => line !== '')
    }

    async function dockerCalls(): Promise<string[]> {
        return (await logLines()).filter((line) => line !== 'compose version --short' && !line.startsWith('env '))
    }

    async function composeImageTags(): Promise<string[]> {
        if (!existsSync(imageTagsFile)) {
            return []
        }
        return (await readFile(imageTagsFile, 'utf8')).split('\n').filter((line) => line !== '')
    }

    function lockExists(): boolean {
        return existsSync(join(installDir, '.update-lock'))
    }

    async function createLock(): Promise<void> {
        await mkdir(join(installDir, '.update-lock'))
    }

    function expectCleanExit(result: LauncherResult): void {
        expect({ code: result.code, stderr: result.stderr }).toEqual({ code: 0, stderr: '' })
    }

    function run(
        args: string[],
        extraEnv: Record<string, string> = {},
        location: { cwd: string; script: string } = { cwd: installDir, script: 'mailer.sh' },
    ): Promise<LauncherResult> {
        const env: NodeJS.ProcessEnv = { ...process.env }
        for (const key of inheritedKeysToDrop) {
            delete env[key]
        }
        env[pathKey()] = `${binDir}${delimiter}${process.env[pathKey()] ?? ''}`
        Object.assign(
            env,
            {
                FAKE_LOG: logFile,
                FAKE_ARGV: argvFile,
                FAKE_STDIN: stdinFile,
                FAKE_MAIL_BIN: mailBinDir,
                FAKE_DOVEADM_ARGV: doveadmArgvFile,
                FAKE_ACCOUNTS: accountsFile,
                FAKE_IMAGE_TAGS: imageTagsFile,
            },
            extraEnv,
        )
        return new Promise((resolve, reject) => {
            const child = spawn(shell!, [location.script, ...args], {
                cwd: location.cwd,
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
            })
            let stdout = ''
            let stderr = ''
            child.stdout.on('data', (chunk: Buffer) => {
                stdout += chunk.toString()
            })
            child.stderr.on('data', (chunk: Buffer) => {
                stderr += chunk.toString()
            })
            child.on('error', reject)
            child.on('close', (code) => resolve({ code, stdout, stderr }))
        })
    }

    beforeEach(async () => {
        rootDir = await mkdtemp(join(tmpdir(), 'mailer-launcher-'))
        installDir = join(rootDir, 'install dir')
        binDir = join(rootDir, 'bin')
        logFile = join(rootDir, 'docker.log')
        argvFile = join(rootDir, 'docker.argv')
        stdinFile = join(rootDir, 'doveadm.stdin')
        mailBinDir = join(rootDir, 'mail-bin')
        doveadmArgvFile = join(rootDir, 'doveadm.argv')
        accountsFile = join(rootDir, 'postfix-accounts.cf')
        imageTagsFile = join(rootDir, 'compose.image-tags')
        await mkdir(installDir)
        await mkdir(binDir)
        await mkdir(mailBinDir)
        await writeFile(join(binDir, 'docker'), fakeDocker)
        await chmod(join(binDir, 'docker'), 0o755)
        await writeFile(join(mailBinDir, 'doveadm'), fakeDoveadm)
        await chmod(join(mailBinDir, 'doveadm'), 0o755)
        await copyFile(launcherSource, join(installDir, 'mailer.sh'))
        await writeEnv(defaultEnv)
        mountSource = await shellOutput('pwd -W 2>/dev/null || pwd')
        user = await shellOutput('printf "%s:%s" "$(id -u)" "$(id -g)"')
    })

    it('records the mount source as the install directory, space included', () => {
        expect(mountSource.endsWith('/install dir')).toBe(true)
        expect(user).toMatch(/^\d+:\d+$/)
    })

    afterEach(async () => {
        await rm(rootDir, { recursive: true, force: true })
    })

    it('start, stop, restart, status, logs and compose map to docker compose', async () => {
        const commands = [
            ['start'],
            ['stop'],
            ['restart'],
            ['status'],
            ['logs', '-f', 'backend'],
            ['compose', 'config'],
        ]
        for (const command of commands) {
            const result = await run(command)
            expectCleanExit(result)
        }
        expect(await dockerCalls()).toEqual([
            'compose up -d',
            'compose stop',
            'compose restart',
            'compose ps',
            'compose logs -f backend',
            'compose config',
        ])
    })

    it('setup runs the CLI with the frozen mount and user, then starts the stack', async () => {
        const result = await run(['setup', '--yes'])
        const calls = await argvCallsWithoutVersion()
        const runIndex = calls.indexOf(cliRun('1.0.0', noLogFlags, ['setup', '--image-tag', '1.0.0', '--yes']))
        expectCleanExit(result)
        expect(runIndex).toBe(0)
        expect(calls.indexOf(recorded(['compose', 'up', '-d', '--pull', 'missing']))).toBeGreaterThan(runIndex)
        expect(calls.filter((call) => call.startsWith('[pull]'))).toEqual([])
        expect(result.stdout).toContain(
            'mailer runs at https://mail.example.com. Setup token for the first login: sh mailer.sh token',
        )
    })

    it('setup uses and pulls latest in an empty directory', async () => {
        await rm(join(installDir, '.env'))
        const result = await run(['setup'])
        expect(result.code).toBe(1)
        expect(result.stderr).toBe('mailer.sh: DB_PASSWORD is not set\n')
        expect((await argvCallsWithoutVersion()).slice(0, 2)).toEqual([
            recorded(['pull', 'ghcr.io/schwarzdavid/mailer:latest']),
            cliRun('latest', noLogFlags, ['setup', '--image-tag', 'latest']),
        ])
    })

    it('setup checks Compose before it runs the wizard', async () => {
        const result = await run(['setup', '--yes'], { FAKE_COMPOSE_VERSION: '2.20.0' })
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('mailer.sh: Docker Compose 2.23.1 or newer is required (found 2.20.0).')
        expect(await argvCallsWithoutVersion()).toEqual([])
    })

    it('setup refuses an operator-supplied --image-tag', async () => {
        for (const args of [
            ['setup', '--image-tag', '1.2.0'],
            ['setup', '--yes', '--image-tag=1.2.0'],
        ]) {
            const result = await run(args)
            expect(result.code).toBe(2)
            expect(result.stderr).toContain(
                'mailer.sh: set IMAGE_TAG in .env to choose the version; setup does not take --image-tag',
            )
        }
        expect(await argvCallsWithoutVersion()).toEqual([])
    })

    it('setup does not start the stack when the CLI asks for a review first', async () => {
        const result = await run(['setup', '--yes'], { FAKE_CLI_EXIT: '4' })
        expect(result.code).toBe(4)
        expect(result.stderr).toBe(
            'mailer.sh: the stack was not started. Move your changes from compose.yml.legacy into compose.override.yml, then run: sh mailer.sh setup --yes\n',
        )
        expect((await logLines()).filter((line) => line.startsWith('compose up'))).toEqual([])
    })

    it('setup explains an image without the mailer CLI', async () => {
        const result = await run(['setup', '--yes'], { FAKE_CLI_EXIT: '127' })
        expect(result.code).toBe(1)
        expect(result.stderr).toContain(
            'mailer.sh: the image ghcr.io/schwarzdavid/mailer:1.0.0 has no mailer CLI; set IMAGE_TAG=latest in .env and run setup again',
        )
        expect((await logLines()).filter((line) => line.startsWith('compose up'))).toEqual([])
    })

    it('operates on its own directory even when CDPATH names another one', async () => {
        const decoyDir = join(rootDir, 'decoy', 'install dir')
        await mkdir(decoyDir, { recursive: true })
        await writeFile(join(decoyDir, '.env'), 'IMAGE_TAG=9.9.9\nMAILER_FORMAT_VERSION=9\n')
        const result = await run(
            ['version'],
            { CDPATH: join(rootDir, 'decoy') },
            {
                cwd: rootDir,
                script: 'install dir/mailer.sh',
            },
        )
        expectCleanExit(result)
        expect(result.stdout).toBe('mailer 1.0.0\nformat 1\n')
    })

    it('reads an unquoted .env value up to an inline comment, as Compose does', async () => {
        await writeFile(
            join(installDir, '.env'),
            (await readFile(join(installDir, '.env'), 'utf8')).replace('IMAGE_TAG=1.0.0', 'IMAGE_TAG=1.0.0 # pinned'),
        )
        const result = await run(['start'])
        expectCleanExit(result)
        expect(await composeImageTags()).toEqual(['1.0.0|compose up -d'])
    })

    it('hashes the mailbox password with doveadm from stdin and never passes it as an argument', async () => {
        await writeFile(
            accountsFile,
            'other@mx.example.com|{SHA512-CRYPT}other\nBounce@mx.example.com|{SHA512-CRYPT}old\n',
        )
        const result = await run(['setup', '--yes'])
        expectCleanExit(result)
        expect(await readFile(stdinFile, 'utf8')).toBe(`${mailPassword}\n${mailPassword}\n`)
        expect(await readFile(doveadmArgvFile, 'utf8')).toBe('pw -s SHA512-CRYPT\n')
        expect(await readFile(accountsFile, 'utf8')).toBe(
            'other@mx.example.com|{SHA512-CRYPT}other\nbounce@mx.example.com|{SHA512-CRYPT}$6$fake\n',
        )
        const calls = await argvCalls()
        expect(calls.filter((call) => call.includes(mailPassword))).toEqual([])
        expect(calls.filter((call) => call.includes('[setup][email]'))).toEqual([])
        expect((await logLines()).filter((line) => line.includes(mailPassword))).toEqual([])
        expect(result.stdout).not.toContain(mailPassword)
        expect(result.stdout).toContain('Updated the password of bounce@mx.example.com.')
    })

    it('creates the mailbox when the account list does not hold it yet', async () => {
        await writeFile(accountsFile, 'bounce@mxXexample.com|{SHA512-CRYPT}other\n')
        const result = await run(['setup', '--yes'])
        expectCleanExit(result)
        expect(await readFile(accountsFile, 'utf8')).toBe(
            'bounce@mxXexample.com|{SHA512-CRYPT}other\nbounce@mx.example.com|{SHA512-CRYPT}$6$fake\n',
        )
        expect(result.stdout).toContain('Created the mailbox bounce@mx.example.com.')
        expect(result.stdout).not.toContain('Updated the password')
    })

    it('writes the account in lower case and replaces its existing line for a mixed-case MAIL_HOSTNAME', async () => {
        await writeEnv({ ...defaultEnv, MAIL_HOSTNAME: 'Mx.Example.com' })
        await writeFile(accountsFile, 'bounce@mx.example.com|{SHA512-CRYPT}old\n')
        const result = await run(['setup', '--yes'])
        expectCleanExit(result)
        expect(await readFile(accountsFile, 'utf8')).toBe('bounce@mx.example.com|{SHA512-CRYPT}$6$fake\n')
        expect(result.stdout).toContain('Updated the password of')
        expect(result.stdout).not.toContain('Created the mailbox')
    })

    it('stops at once and leaves the account list untouched when the password cannot be hashed', async () => {
        const accounts = 'bounce@mx.example.com|{SHA512-CRYPT}old\n'
        await writeFile(accountsFile, accounts)
        const result = await run(['setup', '--yes'], { FAKE_DOVEADM_SILENT: '1' })
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('could not hash the mailbox password')
        expect(await readFile(accountsFile, 'utf8')).toBe(accounts)
        const mailboxCalls = (await argvCalls()).filter((call) =>
            call.startsWith(recorded(['compose', 'exec', '-T', 'mail', 'sh', '-c'])),
        )
        expect(mailboxCalls).toHaveLength(1)
        expect(result.stdout + result.stderr).not.toContain(mailPassword)
        expect((await logLines()).filter((line) => line.includes(mailPassword))).toEqual([])
    })

    it('hands compose the IMAGE_TAG of .env, not the one in the environment', async () => {
        const result = await run(['start'], { IMAGE_TAG: 'stale' })
        expectCleanExit(result)
        expect(await composeImageTags()).toEqual(['1.0.0|compose up -d'])
    })

    it('_finish-update starts the target IMAGE_TAG that the CLI wrote to .env, the backend first', async () => {
        await createLock()
        const result = await run(['update', '--to', '1.1.0'], { IMAGE_TAG: '1.0.0' })
        expectCleanExit(result)
        expect(await readFile(join(installDir, '.env'), 'utf8')).toMatch(/^IMAGE_TAG=1\.1\.0$/m)
        expect((await composeImageTags()).filter((line) => line.includes('|compose up'))).toEqual([
            '1.1.0|compose up -d --pull missing --wait --wait-timeout 300 backend',
            '1.1.0|compose up -d --remove-orphans',
        ])
    })

    it('update names the version .env holds afterwards, not the one requested', async () => {
        const result = await run(['update', '--to', 'latest'], { FAKE_CLI_WRITES_TAG: '1.2.0' })
        expectCleanExit(result)
        expect(await argvCalls()).toContain(migrateRun('latest'))
        expect(result.stdout).toContain('Updated from 1.0.0 to 1.2.0.')
        expect(lockExists()).toBe(false)
    })

    it('update leaves the Compose check to _finish-update, after the hand-over', async () => {
        const result = await run(['update', '--to', '1.1.0'], { FAKE_COMPOSE_VERSION: 'garbage' })
        expect(result.code).toBe(1)
        expect(await argvCalls()).toContain(migrateRun('1.1.0'))
        expect(result.stderr).toContain('mailer.sh: Docker Compose 2.23.1 or newer is required (found garbage).')
        expect(result.stderr).toContain('mailer.sh: the update to 1.1.0 did not come up.')
        expect((await logLines()).filter((line) => line.startsWith('compose up'))).toEqual([])
        expect(lockExists()).toBe(false)
    })

    it('the released launcher hands over to the new mailer.sh with exactly _finish-update <from> <to>', async () => {
        const stubFile = join(rootDir, 'stub.sh')
        const recordFile = join(rootDir, 'stub.record')
        await writeFile(stubFile, recordingStub)
        await copyFile(releasedLauncher, join(installDir, 'mailer.sh'))
        const installPath = await shellOutput('pwd')
        const result = await run(['update', '--to', '1.1.0'], {
            FAKE_NEW_LAUNCHER: stubFile,
            FAKE_STUB_RECORD: recordFile,
        })
        expectCleanExit(result)
        expect(await readFile(join(installDir, 'mailer.sh'), 'utf8')).toBe(recordingStub)
        expect(await readFile(recordFile, 'utf8')).toBe(
            `args=_finish-update 1.0.0 1.1.0\npwd=${installPath}\nIMAGE_TAG=1.0.0\nMAILER_WRAPPED=\n`,
        )
    })

    it('a wrapped update runs the wrapper once and hands its secret to the compose up of _finish-update', async () => {
        const withoutDbPassword = Object.fromEntries(
            Object.entries(defaultEnv).filter(([key]) => key !== 'DB_PASSWORD'),
        )
        await writeEnv({ ...withoutDbPassword, MAILER_SECRETS_WRAPPER: 'X=1 sh ./wrap.sh' })
        await writeInstallFile('wrap.sh', recordingWrapper)
        const result = await run(['update', '--to', '1.1.0'])
        expectCleanExit(result)
        expect(await readFile(join(installDir, 'wrapper.ran'), 'utf8')).toBe('1\n')
        const upCalls = (await logLines()).filter((line) => line.startsWith('compose up') || line.startsWith('env '))
        expect(upCalls).toEqual([
            'env DB_PASSWORD=from-wrapper',
            'compose up -d --pull missing --wait --wait-timeout 300 backend',
            'env DB_PASSWORD=from-wrapper',
            'compose up -d --remove-orphans',
        ])
        expect(result.stdout).toContain('Updated from 1.0.0 to 1.1.0.')
        expect(lockExists()).toBe(false)
    })

    it('refuses an old Compose', async () => {
        const result = await run(['start'], { FAKE_COMPOSE_VERSION: '2.20.0' })
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('mailer.sh: Docker Compose 2.23.1 or newer is required (found 2.20.0).')
        expect(await dockerCalls()).toEqual([])
    })

    it('accepts Compose 2.23.1 with a leading v and a build suffix', async () => {
        const accepted = await run(['start'], { FAKE_COMPOSE_VERSION: 'v2.23.1-desktop.1' })
        const refused = await run(['start'], { FAKE_COMPOSE_VERSION: '2.23.0' })
        expectCleanExit(accepted)
        expect(refused.code).toBe(1)
        expect(await dockerCalls()).toEqual(['compose up -d'])
    })

    it('fails before starting when a secret is missing', async () => {
        await writeEnv({ ...defaultEnv, DB_PASSWORD: '' })
        const result = await run(['start'])
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('mailer.sh: DB_PASSWORD is not set')
        expect((await logLines()).filter((line) => line.startsWith('compose up'))).toEqual([])
    })

    it('runs under the secrets wrapper and hands its secrets to compose', async () => {
        const withoutDbPassword = Object.fromEntries(
            Object.entries(defaultEnv).filter(([key]) => key !== 'DB_PASSWORD'),
        )
        await writeEnv({ ...withoutDbPassword, MAILER_SECRETS_WRAPPER: 'sh ./wrap.sh' })
        await writeInstallFile('wrap.sh', '#!/bin/sh\nDB_PASSWORD=from-wrapper\nexport DB_PASSWORD\nexec "$@"\n')
        const result = await run(['start'])
        expectCleanExit(result)
        expect(await logLines()).toEqual(['compose version --short', 'env DB_PASSWORD=from-wrapper', 'compose up -d'])
    })

    it('runs a wrapper that starts with a variable assignment and returns the exit status of the wrapped command', async () => {
        const withoutDbPassword = Object.fromEntries(
            Object.entries(defaultEnv).filter(([key]) => key !== 'DB_PASSWORD'),
        )
        await writeEnv({ ...withoutDbPassword, MAILER_SECRETS_WRAPPER: 'X=1 sh ./wrap.sh' })
        await writeInstallFile('wrap.sh', recordingWrapper)
        const started = await run(['start'])
        expectCleanExit(started)
        expect(await logLines()).toEqual(['compose version --short', 'env DB_PASSWORD=from-wrapper', 'compose up -d'])
        const manual = await run(['update', '--to', '1.1.0'], { FAKE_CLI_EXIT: '3' })
        expect(manual.code).toBe(3)
        expect(
            (await argvCalls()).filter((call) => call.endsWith('[mailer][migrate-project][--image-tag][1.1.0]')),
        ).toHaveLength(1)
        expect(await readFile(join(installDir, 'wrapper.ran'), 'utf8')).toBe('1\n1\n')
    })

    it('replaces {} in the wrapper with one quoted command', async () => {
        await writeEnv({ ...defaultEnv, MAILER_SECRETS_WRAPPER: 'sh ./one.sh {}' })
        await writeInstallFile('one.sh', '#!/bin/sh\nprintf \'%s\\n\' "$#" >one.count\nexec sh -c "$1"\n')
        const result = await run(['status'])
        expectCleanExit(result)
        expect(await readFile(join(installDir, 'one.count'), 'utf8')).toBe('1\n')
        expect(await dockerCalls()).toEqual(['compose ps'])
    })

    it('update needs --to', async () => {
        const result = await run(['update'])
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('mailer.sh: this version needs a target: sh mailer.sh update --to <version>')
        expect(await logLines()).toEqual([])
    })

    it('update --to v is missing its target', async () => {
        const result = await run(['update', '--to', 'v'])
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('mailer.sh: this version needs a target: sh mailer.sh update --to <version>')
        expect(await logLines()).toEqual([])
    })

    it('update to the running version changes nothing', async () => {
        const result = await run(['update', '--to', '1.0.0'])
        expectCleanExit(result)
        expect(result.stdout).toBe('Already on 1.0.0. If the last update did not finish, run: sh mailer.sh start\n')
        expect(await logLines()).toEqual([])
    })

    it('update to the running version fails while an unfinished update left its lock', async () => {
        await createLock()
        const result = await run(['update', '--to', '1.0.0'])
        expect(result.code).toBe(1)
        expect(result.stderr).toBe(
            'mailer.sh: an update did not finish (.update-lock exists). If no update is running, remove .update-lock and run: sh mailer.sh start\n',
        )
        expect(await logLines()).toEqual([])
        expect(lockExists()).toBe(true)
    })

    it('update refuses another major without the major command', async () => {
        const refused = await run(['update', '--to', '2.0.0'])
        expect(refused.code).toBe(1)
        expect(refused.stderr).toContain(
            'mailer.sh: 2.0.0 is a new major version. Read its release notes, then run: sh mailer.sh update major --to 2.0.0',
        )
        expect((await logLines()).filter((line) => line.startsWith('pull'))).toEqual([])

        await createLock()
        const accepted = await run(['update', 'major', '--to', '2.0.0'])
        expectCleanExit(accepted)
        expect(await logLines()).toContain('pull ghcr.io/schwarzdavid/mailer:2.0.0')
        expect(await argvCalls()).toContain(migrateRun('2.0.0'))
        expect(accepted.stdout).toContain('Updated from 1.0.0 to 2.0.0.')
    })

    it('update strips a leading v and hands over to _finish-update', async () => {
        await createLock()
        const result = await run(['update', '--to', 'v1.1.0'])
        const calls = await argvCallsWithoutVersion()
        expectCleanExit(result)
        expect(calls.slice(0, 4)).toEqual([
            recorded(['pull', 'ghcr.io/schwarzdavid/mailer:1.1.0']),
            migrateRun('1.1.0'),
            recorded(['compose', 'up', '-d', '--pull', 'missing', '--wait', '--wait-timeout', '300', 'backend']),
            recorded(['compose', 'up', '-d', '--remove-orphans']),
        ])
        expect(result.stdout).toContain('Updated from 1.0.0 to 1.1.0.')
        expect(lockExists()).toBe(false)
    })

    it('update stops with exit 3 and changes nothing when the CLI needs manual action', async () => {
        const cliMessage = 'This installation is newer than the image; a downgrade is not supported.'
        const result = await run(['update', '--to', '1.1.0'], { FAKE_CLI_EXIT: '3', FAKE_CLI_STDERR: cliMessage })
        expect(result.code).toBe(3)
        expect(result.stderr).toBe(`${cliMessage}\n`)
        expect(await argvCalls()).toEqual([
            recorded(['pull', 'ghcr.io/schwarzdavid/mailer:1.1.0']),
            migrateRun('1.1.0'),
        ])
        expect(lockExists()).toBe(false)
    })

    it('update fails with exit 1 when the CLI fails', async () => {
        const result = await run(['update', '--to', '1.1.0'], { FAKE_CLI_EXIT: '2' })
        expect(result.code).toBe(1)
        expect((await logLines()).filter((line) => line.startsWith('compose up'))).toEqual([])
        expect(lockExists()).toBe(false)
    })

    it('update fails when the image cannot be pulled and leaves no lock', async () => {
        const result = await run(['update', '--to', '1.1.0'], { FAKE_FAIL: '^(pull|image inspect)' })
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('mailer.sh: could not pull ghcr.io/schwarzdavid/mailer:1.1.0')
        expect((await logLines()).filter((line) => line.startsWith('run '))).toEqual([])
        expect(lockExists()).toBe(false)
    })

    it('update falls back to a local image when the pull fails', async () => {
        await createLock()
        const result = await run(['update', '--to', '1.1.0'], { FAKE_FAIL: '^pull' })
        expect(result.code).toBe(0)
        expect(result.stderr).toBe(
            'mailer.sh: could not pull ghcr.io/schwarzdavid/mailer:1.1.0; using the local image\n',
        )
        expect(await argvCalls()).toContain(migrateRun('1.1.0'))
        expect(lockExists()).toBe(false)
    })

    it('_finish-update removes the lock when the stack does not come up', async () => {
        await createLock()
        await writeEnv({ ...defaultEnv, IMAGE_TAG: '1.1.0' })
        const result = await run(['_finish-update', '1.0.0', '1.1.0'], { FAKE_FAIL: '--wait' })
        expect(result.code).toBe(1)
        expect(result.stderr).toContain(
            'mailer.sh: the update to 1.1.0 did not come up. The previous files are in backups/snapshots/; see the rollback page of the documentation.',
        )
        expect((await logLines()).filter((line) => line.startsWith('compose up'))).toEqual([
            'compose up -d --pull missing --wait --wait-timeout 300 backend',
        ])
        expect(lockExists()).toBe(false)
    })

    it('_finish-update with the wrong argument count exits 2 and leaves a lock it does not own', async () => {
        await createLock()
        const result = await run(['_finish-update', '1.0.0'])
        expect(result.code).toBe(2)
        expect(result.stderr).toContain('mailer.sh: _finish-update needs <from> <to>')
        expect(await logLines()).toEqual([])
        expect(lockExists()).toBe(true)
    })

    it('_finish-update reports a failed mailbox step on its own, without the rollback hint', async () => {
        await createLock()
        await writeEnv({ ...defaultEnv, IMAGE_TAG: '1.1.0' })
        const result = await run(['_finish-update', '1.0.0', '1.1.0'], { FAKE_DOVEADM_SILENT: '1' })
        expect(result.code).toBe(1)
        expect(result.stderr).toContain(
            'mailer.sh: updated to 1.1.0, but the bounce mailbox could not be set; run: sh mailer.sh setup --yes',
        )
        expect(result.stderr).not.toContain('rollback')
        expect(result.stdout).not.toContain('Updated from')
        expect(lockExists()).toBe(false)
    })

    it('names the launcher command for the logs when the mail service never accepts the account', async () => {
        await writeInstallFile('.clock', '0')
        await writeFile(
            join(binDir, 'date'),
            '#!/bin/sh\nnow=$(cat .clock)\nprintf \'%s\\n\' "$((now + 1000))" >.clock\nprintf \'%s\\n\' "$now"\n',
        )
        await chmod(join(binDir, 'date'), 0o755)
        const result = await run(['setup', '--yes'], { FAKE_FAIL: '^compose exec -T mail true' })
        expect(result.code).toBe(1)
        expect(result.stderr).toContain(
            'mailer.sh: the mail service did not accept the account within 10 minutes; check: sh mailer.sh compose logs proxy mail',
        )
    })

    it('_finish-update reports a missing secret as a failed update and removes the lock', async () => {
        await createLock()
        await writeEnv({ ...defaultEnv, IMAGE_TAG: '1.1.0', MAIL_PASSWORD: '' })
        const result = await run(['_finish-update', '1.0.0', '1.1.0'])
        expect(result.code).toBe(1)
        expect(result.stderr).toContain('mailer.sh: MAIL_PASSWORD is not set')
        expect(result.stderr).toContain('mailer.sh: the update to 1.1.0 did not come up.')
        expect((await logLines()).filter((line) => line.startsWith('compose up'))).toEqual([])
        expect(lockExists()).toBe(false)
    })

    it('_finish-update removes the lock when the secrets wrapper fails', async () => {
        await createLock()
        await writeEnv({ ...defaultEnv, MAILER_SECRETS_WRAPPER: 'sh ./broken.sh' })
        await writeInstallFile('broken.sh', '#!/bin/sh\nexit 4\n')
        const result = await run(['_finish-update', '1.0.0', '1.1.0'])
        expect(result.code).toBe(4)
        expect(await logLines()).toEqual([])
        expect(lockExists()).toBe(false)
    })

    it('token prints the last setup token', async () => {
        const logsFile = join(rootDir, 'backend.log')
        await writeFile(
            logsFile,
            [
                'backend-1  | {"level":30,"msg":"No user exists yet. Setup token: 00112233445566778899aabbccddeeff"}',
                'backend-1  | {"level":30,"msg":"No user exists yet. Setup token: 0123456789abcdef0123456789abcdef"}',
                '',
            ].join('\n'),
        )
        const result = await run(['token'], { FAKE_LOGS: logsFile })
        expectCleanExit(result)
        expect(result.stdout).toBe('0123456789abcdef0123456789abcdef\n')
        expect(await dockerCalls()).toEqual(['compose logs --no-color backend'])
    })

    it('token fails when the backend log holds no token', async () => {
        const result = await run(['token'])
        expect(result.code).toBe(1)
        expect(result.stderr).toContain(
            'mailer.sh: No setup token in the backend log; a user already exists or the backend has not started.',
        )
    })

    it('version prints the image tag and the format', async () => {
        const result = await run(['version'])
        expectCleanExit(result)
        expect(result.stdout).toBe('mailer 1.0.0\nformat 1\n')
    })

    it('help lists the public commands and an unknown command exits 2', async () => {
        const help = await run(['help'])
        const unknown = await run(['nonsense'])
        expect(help.code).toBe(0)
        expect(help.stdout).toContain('update [major] --to <version>')
        expect(help.stdout).not.toContain('_finish-update')
        expect((await run([])).stdout).toBe(help.stdout)
        expect(unknown.code).toBe(2)
        expect(unknown.stderr).toContain(help.stdout)
    })

    it('doctor reports each check and stops at the first failure', async () => {
        const healthy = await run(['doctor'])
        expectCleanExit(healthy)
        expect(healthy.stdout).toContain('ok: Docker Compose 2.30.0')
        expect(healthy.stdout).toContain('ok: BACKEND_ENCRYPTION_SECRET is available')

        await writeEnv({ ...defaultEnv, MAIL_HOSTNAME: '' })
        const broken = await run(['doctor'])
        expect(broken.code).toBe(1)
        expect(broken.stdout).toContain('ok: SITE_ADDRESS is set')
        expect(broken.stdout).not.toContain('DB_PASSWORD')
        expect(broken.stderr).toContain('mailer.sh: MAIL_HOSTNAME is empty in .env')
    })

    it('recovery-kit runs the CLI with the secret names only', async () => {
        const result = await run(['recovery-kit'], { DB_PASSWORD: 'from-environment' })
        expectCleanExit(result)
        expect(await argvCalls()).toEqual([cliRun('1.0.0', noLogFlags, ['recovery-kit'])])
    })
})
