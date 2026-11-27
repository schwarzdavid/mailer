import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Mock } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostResolver } from './commands/setup.ts'
import { run } from './main.ts'
import type { MainDeps } from './main.ts'
import type { Prompter } from './prompter.ts'

const filledEnv = [
    'SITE_ADDRESS=admin.example.org',
    'MAIL_HOSTNAME=mx.example.net',
    'MAIL_SERVER_IPV4=203.0.113.10',
    'DB_PASSWORD=existing-db-password',
    'BACKEND_JWT_SECRET=existing-jwt-secret-existing-jwt-secret',
    'BACKEND_ENCRYPTION_SECRET=existing-encryption-secret-existing-secret',
    'MAIL_PASSWORD=existing-mail-password',
    'MAILER_FORMAT_VERSION=1',
    '',
].join('\n')

describe('run', () => {
    let projectDir: string
    let assetsDir: string
    let out: Mock<(line: string) => void>
    let err: Mock<(line: string) => void>
    let deps: MainDeps

    function environment(extra: Record<string, string> = {}): Record<string, string | undefined> {
        return { MAILER_PROJECT_DIR: projectDir, MAILER_ASSETS_DIR: assetsDir, MAILER_VERSION: '1.4.0', ...extra }
    }

    beforeEach(async () => {
        projectDir = await mkdtemp(join(tmpdir(), 'mailer-cli-main-'))
        assetsDir = await mkdtemp(join(tmpdir(), 'mailer-cli-main-assets-'))
        await writeFile(join(assetsDir, 'compose.yml'), 'services:\n  proxy: {}\n')
        await writeFile(join(assetsDir, 'mailer.sh'), '#!/bin/sh\n')
        out = vi.fn<(line: string) => void>()
        err = vi.fn<(line: string) => void>()
        const prompter: Prompter = {
            text: vi.fn<Prompter['text']>(),
            select: vi.fn<Prompter['select']>() as Prompter['select'],
            confirm: vi.fn<Prompter['confirm']>(),
            note: vi.fn<Prompter['note']>(),
        }
        const resolver: HostResolver = {
            resolve4: vi.fn<HostResolver['resolve4']>(() => Promise.resolve([])),
            resolve6: vi.fn<HostResolver['resolve6']>(() => Promise.resolve([])),
        }
        deps = { prompter, resolver, out, err }
    })

    it('returns the usage code for migrate-project without --image-tag', async () => {
        expect(await run(['migrate-project'], environment(), deps)).toBe(2)
        expect(err).toHaveBeenCalledTimes(1)
    })

    it('returns the usage code for an unknown command', async () => {
        expect(await run(['nope'], environment(), deps)).toBe(2)
        expect(err).toHaveBeenCalledTimes(1)
    })

    it('returns the usage code for an unknown option', async () => {
        expect(await run(['recovery-kit', '--nope'], environment(), deps)).toBe(2)
    })

    it('returns the usage code without a command', async () => {
        expect(await run([], environment(), deps)).toBe(2)
    })

    it('returns the usage code for an invalid --secrets value', async () => {
        expect(await run(['setup', '--yes', '--secrets', 'nope'], environment(), deps)).toBe(2)
    })

    it('returns the exit code of a CliError and prints its message through err', async () => {
        const code = await run(['migrate-project', '--image-tag', '9.9.9'], environment(), deps)
        expect(code).toBe(3)
        expect(err).toHaveBeenCalledWith('This directory was not set up by mailer.sh; run: sh mailer.sh setup')
    })

    it('returns the failure code and the message for any other error', async () => {
        await mkdir(join(projectDir, '.env'))
        const code = await run(['recovery-kit'], environment(), deps)
        expect(code).toBe(1)
        expect(err).toHaveBeenCalledTimes(1)
    })

    it('prints the baked version for --version', async () => {
        expect(await run(['--version'], { MAILER_VERSION: '1.4.0' }, deps)).toBe(0)
        expect(out).toHaveBeenCalledWith('1.4.0')
    })

    it('prints the development version when none is baked', async () => {
        expect(await run(['--version'], {}, deps)).toBe(0)
        expect(out).toHaveBeenCalledWith('0.0.0-dev')
    })

    it('prints the recovery kit for the recovery-kit command', async () => {
        await writeFile(join(projectDir, '.env'), filledEnv)
        expect(await run(['recovery-kit'], environment(), deps)).toBe(0)
        const printed = out.mock.calls.map(([line]) => line)
        expect(printed).toContain('DB_PASSWORD=existing-db-password')
    })

    it('migrates a project through migrate-project', async () => {
        await writeFile(join(projectDir, '.env'), filledEnv)
        await writeFile(join(projectDir, 'compose.yml'), 'services:\n  old: {}\n')
        await writeFile(join(projectDir, 'mailer.sh'), '#!/bin/sh\necho old\n')
        expect(await run(['migrate-project', '--image-tag', '9.9.9'], environment(), deps)).toBe(0)
        expect(await readFile(join(projectDir, '.env'), 'utf8')).toContain('IMAGE_TAG=9.9.9')
    })

    it('dry-runs migrate-project without writing', async () => {
        await writeFile(join(projectDir, '.env'), filledEnv)
        await writeFile(join(projectDir, 'compose.yml'), 'services:\n  old: {}\n')
        expect(await run(['migrate-project', '--image-tag', '9.9.9', '--dry-run'], environment(), deps)).toBe(0)
        expect(await readFile(join(projectDir, '.env'), 'utf8')).toBe(filledEnv)
    })

    it('setup --yes on a filled .env returns 0 and prints no recovery kit', async () => {
        await writeFile(join(projectDir, '.env'), filledEnv)
        expect(await run(['setup', '--yes', '--image-tag', 'ci'], environment(), deps)).toBe(0)
        const printed = out.mock.calls.map(([line]) => line).join('\n')
        expect(printed).not.toContain('existing-db-password')
        expect(printed).not.toContain('recovery kit')
    })

    it('setup --yes with an emptied secret generates it and prints the recovery kit', async () => {
        await writeFile(
            join(projectDir, '.env'),
            filledEnv.replace('MAIL_PASSWORD=existing-mail-password', 'MAIL_PASSWORD='),
        )
        expect(await run(['setup', '--yes', '--image-tag', 'ci'], environment(), deps)).toBe(0)
        const env = await readFile(join(projectDir, '.env'), 'utf8')
        const generated = /^MAIL_PASSWORD=(.+)$/m.exec(env)?.[1]
        const printed = out.mock.calls.map(([line]) => line)
        expect(printed).toContain(`MAIL_PASSWORD=${generated}`)
        expect(printed).toContain('DB_PASSWORD=existing-db-password')
        expect(printed.at(-1)).toBe(
            'Store this recovery kit in a password manager. A database backup is worthless without BACKEND_ENCRYPTION_SECRET.',
        )
    })
})
