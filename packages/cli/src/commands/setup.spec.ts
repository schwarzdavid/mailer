import { mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Mock } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CliContext } from '../context.ts'
import { EnvFile } from '../env-file.ts'
import { CliError } from '../errors.ts'
import type { Prompter } from '../prompter.ts'
import { SECRET_KEYS } from '../secrets.ts'
import { runSetup } from './setup.ts'
import type { HostResolver } from './setup.ts'

const { releasedCompose, releasedHash } = await vi.hoisted(async () => {
    const { createHash } = await import('node:crypto')
    const content = 'services:\n  released: {}\n'
    return { releasedCompose: content, releasedHash: createHash('sha256').update(content).digest('hex') }
})

vi.mock('../legacy-templates.ts', () => ({ releasedComposeHashes: [releasedHash] }))

const assetCompose = 'services:\n  proxy: {}\n'
const assetScript = '#!/bin/sh\necho mailer\n'

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

type FakePrompter = Prompter & {
    text: Mock<Prompter['text']>
    select: Mock<Prompter['select']> & Prompter['select']
    confirm: Mock<Prompter['confirm']>
    note: Mock<Prompter['note']>
}

function scriptedPrompter(answers: { text?: string[]; select?: string[]; confirm?: boolean[] } = {}): FakePrompter {
    const texts = [...(answers.text ?? [])]
    const selects = [...(answers.select ?? [])]
    const confirms = [...(answers.confirm ?? [])]
    return {
        text: vi.fn<Prompter['text']>(() => {
            const next = texts.shift()
            return next === undefined ? Promise.reject(new Error('unexpected text prompt')) : Promise.resolve(next)
        }),
        select: vi.fn<Prompter['select']>(() => {
            const next = selects.shift()
            return next === undefined
                ? Promise.reject(new Error('unexpected select prompt'))
                : Promise.resolve(next as never)
        }) as FakePrompter['select'],
        confirm: vi.fn<Prompter['confirm']>(() => {
            const next = confirms.shift()
            return next === undefined ? Promise.reject(new Error('unexpected confirm prompt')) : Promise.resolve(next)
        }),
        note: vi.fn<Prompter['note']>(),
    }
}

async function exitCodeOf(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise
    } catch (error) {
        return (error as CliError).exitCode
    }
    return undefined
}

describe('runSetup', () => {
    let projectDir: string
    let assetsDir: string
    let out: Mock<(line: string) => void>
    let resolver: { resolve4: Mock<HostResolver['resolve4']>; resolve6: Mock<HostResolver['resolve6']> }

    function ctx(overrides: Partial<CliContext> = {}): CliContext {
        return { projectDir, assetsDir, bakedVersion: '1.4.0', env: {}, interactive: false, out, ...overrides }
    }

    beforeEach(async () => {
        projectDir = await mkdtemp(join(tmpdir(), 'mailer-cli-setup-'))
        assetsDir = await mkdtemp(join(tmpdir(), 'mailer-cli-setup-assets-'))
        await writeFile(join(assetsDir, 'compose.yml'), assetCompose)
        await writeFile(join(assetsDir, 'mailer.sh'), assetScript)
        out = vi.fn<(line: string) => void>()
        resolver = {
            resolve4: vi.fn<HostResolver['resolve4']>(() => Promise.resolve([])),
            resolve6: vi.fn<HostResolver['resolve6']>(() => Promise.resolve([])),
        }
    })

    it('with a filled .env and --yes it asks nothing, keeps the secrets and writes the project files', async () => {
        const prompter = scriptedPrompter()
        await writeFile(join(projectDir, '.env'), filledEnv)
        const result = await runSetup(ctx({ interactive: false }), { yes: true, imageTag: 'ci' }, prompter, resolver)
        const env = await EnvFile.read(join(projectDir, '.env'))
        expect(prompter.text).not.toHaveBeenCalled()
        expect(resolver.resolve4).not.toHaveBeenCalled()
        expect(result.generated).toEqual([])
        expect(env.get('DB_PASSWORD')).toBe('existing-db-password')
        expect(env.get('IMAGE_TAG')).toBe('ci')
        expect(env.get('MAILER_FORMAT_VERSION')).toBe('1')
        expect(env.get('DB_DATABASE')).toBe('mailer')
        expect(env.get('DB_USERNAME')).toBe('mailer')
        expect(await readFile(join(projectDir, 'compose.yml'), 'utf8')).toBe(assetCompose)
        expect(await readFile(join(projectDir, 'mailer.sh'), 'utf8')).toBe(assetScript)
    })

    it('generates only the empty secrets and reports them', async () => {
        await writeFile(
            join(projectDir, '.env'),
            filledEnv.replace('MAIL_PASSWORD=existing-mail-password', 'MAIL_PASSWORD='),
        )
        const result = await runSetup(ctx(), { yes: true, imageTag: 'ci' }, scriptedPrompter(), resolver)
        const env = await EnvFile.read(join(projectDir, '.env'))
        expect(result.generated).toEqual(['MAIL_PASSWORD'])
        expect(out).toHaveBeenCalledTimes(1)
        expect(out).toHaveBeenCalledWith('Generated MAIL_PASSWORD in .env.')
        expect(env.get('MAIL_PASSWORD')).not.toBe('')
        expect(env.get('DB_PASSWORD')).toBe('existing-db-password')
    })

    it('names every missing key in a non-interactive run', async () => {
        const failure = runSetup(ctx(), { yes: true, imageTag: 'ci' }, scriptedPrompter(), resolver)
        await expect(failure).rejects.toThrow(/SITE_ADDRESS.*MAIL_HOSTNAME.*MAIL_SERVER_IPV4/)
        expect(await exitCodeOf(runSetup(ctx(), { yes: true, imageTag: 'ci' }, scriptedPrompter(), resolver))).toBe(2)
    })

    it('refuses MAIL_HOSTNAME equal to SITE_ADDRESS', async () => {
        const options = {
            yes: true,
            imageTag: 'ci',
            siteAddress: 'example.org',
            mailHostname: 'example.org',
            mailIpv4: '203.0.113.10',
        }
        expect(await exitCodeOf(runSetup(ctx(), options, scriptedPrompter(), resolver))).toBe(2)
        expect(await readdir(projectDir)).toEqual([])
    })

    it('refuses an invalid IPv4 and an invalid IPv6', async () => {
        const base = { yes: true, imageTag: 'ci', siteAddress: 'a.example.org', mailHostname: 'mx.example.net' }
        const badV4 = runSetup(ctx(), { ...base, mailIpv4: '999.1.1.1' }, scriptedPrompter(), resolver)
        const badV6 = runSetup(
            ctx(),
            { ...base, mailIpv4: '203.0.113.10', mailIpv6: 'nope' },
            scriptedPrompter(),
            resolver,
        )
        expect(await exitCodeOf(badV4)).toBe(2)
        expect(await exitCodeOf(badV6)).toBe(2)
    })

    it('offers the resolved addresses as defaults in the wizard', async () => {
        resolver.resolve4.mockResolvedValue(['203.0.113.10'])
        resolver.resolve6.mockResolvedValue(['2001:db8::10'])
        const prompter = scriptedPrompter({
            text: ['admin.example.org', 'mx.example.net', '203.0.113.10', '2001:db8::10'],
            select: ['generate'],
        })
        await runSetup(ctx({ interactive: true }), { yes: false, imageTag: 'ci' }, prompter, resolver)
        expect(resolver.resolve4).toHaveBeenCalledWith('mx.example.net')
        expect(prompter.text).toHaveBeenCalledWith(expect.objectContaining({ initial: '203.0.113.10' }))
        expect(prompter.text).toHaveBeenCalledWith(expect.objectContaining({ initial: '2001:db8::10' }))
        const env = await EnvFile.read(join(projectDir, '.env'))
        expect(env.get('MAIL_SERVER_IPV4')).toBe('203.0.113.10')
        expect(env.get('MAIL_SERVER_IPV6')).toBe('2001:db8::10')
    })

    it('shows the registrable-domain warning with the MAIL_HOSTNAME prompt', async () => {
        const prompter = scriptedPrompter({
            text: ['admin.example.org', 'mx.example.net', '203.0.113.10', ''],
            select: ['generate'],
        })
        await runSetup(ctx({ interactive: true }), { yes: false, imageTag: 'ci' }, prompter, resolver)
        expect(prompter.note).toHaveBeenCalledWith(expect.stringContaining('registrable domain'))
    })

    it('shows the current values as defaults when setup is run again', async () => {
        await writeFile(join(projectDir, '.env'), filledEnv)
        const prompter = scriptedPrompter({
            text: ['admin.example.org', 'mx.example.net', '203.0.113.10', ''],
            select: ['generate'],
        })
        await runSetup(ctx({ interactive: true }), { yes: false, imageTag: 'ci' }, prompter, resolver)
        expect(prompter.text).toHaveBeenCalledWith(expect.objectContaining({ initial: 'admin.example.org' }))
        expect(prompter.text).toHaveBeenCalledWith(expect.objectContaining({ initial: 'mx.example.net' }))
        expect(prompter.select).not.toHaveBeenCalled()
    })

    it('warns and continues when a name does not resolve', async () => {
        resolver.resolve4.mockRejectedValue(new Error('ENOTFOUND'))
        resolver.resolve6.mockRejectedValue(new Error('ENOTFOUND'))
        const prompter = scriptedPrompter({
            text: ['admin.example.org', 'mx.example.net', '203.0.113.10', ''],
            select: ['generate'],
        })
        const result = await runSetup(ctx({ interactive: true }), { yes: false, imageTag: 'ci' }, prompter, resolver)
        expect(prompter.note).toHaveBeenCalledWith(expect.stringContaining('does not resolve'))
        expect(result.generated).toEqual([...SECRET_KEYS])
    })

    it('accepts a typed secret and refuses one with a dollar sign', async () => {
        const typed = 'a'.repeat(20)
        const prompter = scriptedPrompter({
            text: ['admin.example.org', 'mx.example.net', '203.0.113.10', '', typed, '', '', ''],
            select: ['prompt'],
        })
        const result = await runSetup(ctx({ interactive: true }), { yes: false, imageTag: 'ci' }, prompter, resolver)
        const secretPrompt = prompter.text.mock.calls.find(([call]) => call.message.startsWith('DB_PASSWORD'))?.[0]
        const env = await EnvFile.read(join(projectDir, '.env'))
        expect(secretPrompt?.validate?.('abc$defghijklmnopqrstu')).toEqual(expect.any(String))
        expect(secretPrompt?.validate?.(typed)).toBeUndefined()
        expect(secretPrompt?.validate?.('')).toBeUndefined()
        expect(env.get('DB_PASSWORD')).toBe(typed)
        expect(result.generated).toEqual(['BACKEND_JWT_SECRET', 'BACKEND_ENCRYPTION_SECRET', 'MAIL_PASSWORD'])
    })

    it('external mode writes the wrapper and no secret', async () => {
        const options = { yes: true, imageTag: 'ci', secrets: 'external' as const, secretsWrapper: 'op run --' }
        await writeFile(join(projectDir, '.env'), filledEnv.replace(/^(DB_|BACKEND_|MAIL_PASSWORD).*\n/gm, ''))
        const result = await runSetup(ctx(), options, scriptedPrompter(), resolver)
        const env = await EnvFile.read(join(projectDir, '.env'))
        expect(env.get('MAILER_SECRETS_WRAPPER')).toBe('op run --')
        expect(env.has('DB_PASSWORD')).toBe(false)
        expect(result.generated).toEqual([])
        expect(out).not.toHaveBeenCalled()
    })

    it('external mode shows generated secrets once through a note and never through out', async () => {
        const prompter = scriptedPrompter({
            text: ['admin.example.org', 'mx.example.net', '203.0.113.10', '', 'op run --'],
            select: ['external'],
            confirm: [true],
        })
        await runSetup(ctx({ interactive: true }), { yes: false, imageTag: 'ci' }, prompter, resolver)
        const env = await EnvFile.read(join(projectDir, '.env'))
        const shown = prompter.note.mock.calls
            .map(([message]) => message)
            .find((message) => message.includes('DB_PASSWORD='))
        expect(shown).toContain('MAIL_PASSWORD=')
        expect(env.has('MAIL_PASSWORD')).toBe(false)
        expect(env.get('MAILER_SECRETS_WRAPPER')).toBe('op run --')
        expect(out).not.toHaveBeenCalled()
    })

    it('external mode without a wrapper fails in a non-interactive run', async () => {
        const options = { yes: true, imageTag: 'ci', secrets: 'external' as const }
        await writeFile(join(projectDir, '.env'), filledEnv)
        expect(await exitCodeOf(runSetup(ctx(), options, scriptedPrompter(), resolver))).toBe(2)
    })

    it('keeps an edited compose.yml as compose.yml.legacy and removes setup.sh', async () => {
        await writeFile(join(projectDir, '.env'), filledEnv.replace('MAILER_FORMAT_VERSION=1\n', ''))
        await writeFile(join(projectDir, 'compose.yml'), 'services:\n  mine: {}\n')
        await writeFile(join(projectDir, 'setup.sh'), '#!/bin/sh\n')
        const prompter = scriptedPrompter()
        const result = await runSetup(ctx(), { yes: true, imageTag: 'ci' }, prompter, resolver)
        expect(result.legacyComposeKept).toBe(true)
        expect(await readFile(join(projectDir, 'compose.yml.legacy'), 'utf8')).toBe('services:\n  mine: {}\n')
        expect(await readFile(join(projectDir, 'compose.yml'), 'utf8')).toBe(assetCompose)
        await expect(stat(join(projectDir, 'setup.sh'))).rejects.toThrow()
        expect(prompter.note).toHaveBeenCalledWith(expect.stringContaining('compose.override.yml'))
    })

    it('overwrites a compose.yml that equals a released template without a .legacy copy', async () => {
        await writeFile(join(projectDir, '.env'), filledEnv.replace('MAILER_FORMAT_VERSION=1\n', ''))
        await writeFile(join(projectDir, 'compose.yml'), releasedCompose)
        const result = await runSetup(ctx(), { yes: true, imageTag: 'ci' }, scriptedPrompter(), resolver)
        expect(result.legacyComposeKept).toBe(false)
        expect(await readFile(join(projectDir, 'compose.yml'), 'utf8')).toBe(assetCompose)
        expect(await readdir(projectDir)).not.toContain('compose.yml.legacy')
    })

    it('overwrites a differing compose.yml of a format 1 installation without a .legacy copy', async () => {
        const prompter = scriptedPrompter()
        await writeFile(join(projectDir, '.env'), filledEnv)
        await writeFile(join(projectDir, 'compose.yml'), 'services:\n  older-cli: {}\n')
        const result = await runSetup(ctx(), { yes: true, imageTag: 'ci' }, prompter, resolver)
        expect(result.legacyComposeKept).toBe(false)
        expect(await readFile(join(projectDir, 'compose.yml'), 'utf8')).toBe(assetCompose)
        expect(await readdir(projectDir)).not.toContain('compose.yml.legacy')
        expect(prompter.note).not.toHaveBeenCalledWith(expect.stringContaining('compose.override.yml'))
    })

    it('refuses an installation newer than the image before prompting or writing', async () => {
        const prompter = scriptedPrompter()
        const newerEnv = filledEnv.replace('MAILER_FORMAT_VERSION=1', 'MAILER_FORMAT_VERSION=99')
        await writeFile(join(projectDir, '.env'), newerEnv)
        await writeFile(join(projectDir, 'compose.yml'), 'services:\n  newer: {}\n')
        const failure = runSetup(ctx({ interactive: true }), { yes: false, imageTag: 'ci' }, prompter, resolver)
        await expect(failure).rejects.toThrow(
            'This installation is newer than the image; a downgrade is not supported.',
        )
        expect(await exitCodeOf(runSetup(ctx(), { yes: true, imageTag: 'ci' }, prompter, resolver))).toBe(3)
        expect((await readdir(projectDir)).sort()).toEqual(['.env', 'compose.yml'])
        expect(await readFile(join(projectDir, '.env'), 'utf8')).toBe(newerEnv)
        expect(prompter.text).not.toHaveBeenCalled()
        expect(prompter.note).not.toHaveBeenCalled()
    })

    it('refuses a recorded format newer than the image even without compose.yml', async () => {
        const newerEnv = filledEnv.replace('MAILER_FORMAT_VERSION=1', 'MAILER_FORMAT_VERSION=99')
        await writeFile(join(projectDir, '.env'), newerEnv)
        expect(await exitCodeOf(runSetup(ctx(), { yes: true, imageTag: 'ci' }, scriptedPrompter(), resolver))).toBe(3)
        expect(await readdir(projectDir)).toEqual(['.env'])
        expect(await readFile(join(projectDir, '.env'), 'utf8')).toBe(newerEnv)
    })

    it('treats a prepared .env without a format version and without compose.yml as fresh', async () => {
        await writeFile(join(projectDir, '.env'), filledEnv.replace('MAILER_FORMAT_VERSION=1\n', ''))
        const result = await runSetup(ctx(), { yes: true, imageTag: 'ci' }, scriptedPrompter(), resolver)
        expect(result.legacyComposeKept).toBe(false)
        expect((await readdir(projectDir)).sort()).toEqual(['.env', 'compose.yml', 'mailer.sh'])
        expect((await EnvFile.read(join(projectDir, '.env'))).get('MAILER_FORMAT_VERSION')).toBe('1')
    })

    it('stores pasted answers without their surrounding spaces', async () => {
        const prompter = scriptedPrompter({
            text: [' admin.example.org ', 'mx.example.net ', '203.0.113.10 ', ' 2001:db8::10 '],
            select: ['generate'],
        })
        await runSetup(ctx({ interactive: true }), { yes: false, imageTag: 'ci' }, prompter, resolver)
        const env = await EnvFile.read(join(projectDir, '.env'))
        expect(env.get('SITE_ADDRESS')).toBe('admin.example.org')
        expect(env.get('MAIL_HOSTNAME')).toBe('mx.example.net')
        expect(env.get('MAIL_SERVER_IPV4')).toBe('203.0.113.10')
        expect(env.get('MAIL_SERVER_IPV6')).toBe('2001:db8::10')
        expect(resolver.resolve4).toHaveBeenCalledWith('mx.example.net')
        const ipv4Prompt = prompter.text.mock.calls.find(([call]) => call.message.startsWith('MAIL_SERVER_IPV4'))?.[0]
        expect(ipv4Prompt?.validate?.('203.0.113.10 ')).toBeUndefined()
    })

    it('trims values from options and .env', async () => {
        await writeFile(
            join(projectDir, '.env'),
            filledEnv.replace('MAIL_SERVER_IPV4=203.0.113.10', 'MAIL_SERVER_IPV4=203.0.113.10 '),
        )
        await runSetup(
            ctx(),
            { yes: true, imageTag: 'ci', siteAddress: ' a.example.org ', mailHostname: 'mx.example.net ' },
            scriptedPrompter(),
            resolver,
        )
        const env = await EnvFile.read(join(projectDir, '.env'))
        expect(env.get('SITE_ADDRESS')).toBe('a.example.org')
        expect(env.get('MAIL_HOSTNAME')).toBe('mx.example.net')
        expect(env.get('MAIL_SERVER_IPV4')).toBe('203.0.113.10')
    })

    it('the MAIL_HOSTNAME prompt refuses the site address', async () => {
        const prompter = scriptedPrompter({
            text: ['admin.example.org', 'mx.example.net', '203.0.113.10', ''],
            select: ['generate'],
        })
        await runSetup(ctx({ interactive: true }), { yes: false, imageTag: 'ci' }, prompter, resolver)
        const hostnamePrompt = prompter.text.mock.calls.find(([call]) => call.message.startsWith('MAIL_HOSTNAME'))?.[0]
        expect(hostnamePrompt?.validate?.('admin.example.org')).toEqual(expect.any(String))
        expect(hostnamePrompt?.validate?.(' admin.example.org ')).toEqual(expect.any(String))
        expect(hostnamePrompt?.validate?.('mx.example.net')).toBeUndefined()
        expect(hostnamePrompt?.validate?.(' ')).toEqual(expect.any(String))
    })

    it('refuses --secrets-wrapper with a secrets mode other than external', async () => {
        await writeFile(join(projectDir, '.env'), filledEnv)
        const options = { yes: true, imageTag: 'ci', secrets: 'generate' as const, secretsWrapper: 'op run --' }
        expect(await exitCodeOf(runSetup(ctx(), options, scriptedPrompter(), resolver))).toBe(2)
        expect(await readFile(join(projectDir, '.env'), 'utf8')).toBe(filledEnv)
    })

    it('--secrets-wrapper alone means external secrets', async () => {
        await writeFile(join(projectDir, '.env'), filledEnv.replace(/^(DB_|BACKEND_|MAIL_PASSWORD).*\n/gm, ''))
        const result = await runSetup(
            ctx(),
            { yes: true, imageTag: 'ci', secretsWrapper: 'op run --' },
            scriptedPrompter(),
            resolver,
        )
        const env = await EnvFile.read(join(projectDir, '.env'))
        expect(result.generated).toEqual([])
        expect(env.get('MAILER_SECRETS_WRAPPER')).toBe('op run --')
        expect(env.has('DB_PASSWORD')).toBe(false)
    })

    it('a re-run with a configured wrapper offers to generate secrets with no as the default', async () => {
        const withWrapper = `${filledEnv.replace(/^(DB_|BACKEND_|MAIL_PASSWORD).*\n/gm, '')}MAILER_SECRETS_WRAPPER=op run --\n`
        await writeFile(join(projectDir, '.env'), withWrapper)
        const prompter = scriptedPrompter({
            text: ['admin.example.org', 'mx.example.net', '203.0.113.10', ''],
            select: ['external'],
            confirm: [false],
        })
        await runSetup(ctx({ interactive: true }), { yes: false, imageTag: 'ci' }, prompter, resolver)
        expect(prompter.confirm).toHaveBeenCalledWith(expect.objectContaining({ initial: false }))
    })

    it('keeps the foreign lines of a prepared .env when no compose.yml exists yet', async () => {
        await writeFile(join(projectDir, '.env'), `${filledEnv}CUSTOM_SETTING=kept\n`)
        await runSetup(ctx(), { yes: true, imageTag: 'ci' }, scriptedPrompter(), resolver)
        const env = await EnvFile.read(join(projectDir, '.env'))
        expect(env.get('CUSTOM_SETTING')).toBe('kept')
    })

    it('writes nothing when the wizard is cancelled', async () => {
        const prompter = scriptedPrompter()
        prompter.text.mockRejectedValueOnce(new CliError('Setup cancelled.'))
        await expect(runSetup(ctx({ interactive: true }), { yes: false }, prompter, resolver)).rejects.toThrow(
            'Setup cancelled.',
        )
        expect(await readdir(projectDir)).toEqual([])
    })

    it('pins the baked version when started from latest', async () => {
        await writeFile(join(projectDir, '.env'), filledEnv)
        await runSetup(ctx(), { yes: true, imageTag: 'latest' }, scriptedPrompter(), resolver)
        const env = await EnvFile.read(join(projectDir, '.env'))
        expect(env.get('IMAGE_TAG')).toBe('1.4.0')
    })

    it('uses an existing IMAGE_TAG only when no option is given', async () => {
        await writeFile(join(projectDir, '.env'), `${filledEnv}IMAGE_TAG=1.2.0\n`)
        await runSetup(ctx(), { yes: true }, scriptedPrompter(), resolver)
        expect((await EnvFile.read(join(projectDir, '.env'))).get('IMAGE_TAG')).toBe('1.2.0')
        await runSetup(ctx(), { yes: true, imageTag: '1.3.0' }, scriptedPrompter(), resolver)
        expect((await EnvFile.read(join(projectDir, '.env'))).get('IMAGE_TAG')).toBe('1.3.0')
    })

    it('never leaks a generated secret through out', async () => {
        await runSetup(
            ctx(),
            {
                yes: true,
                imageTag: 'ci',
                siteAddress: 'a.example.org',
                mailHostname: 'mx.example.net',
                mailIpv4: '203.0.113.10',
            },
            scriptedPrompter(),
            resolver,
        )
        const env = await EnvFile.read(join(projectDir, '.env'))
        const printed = out.mock.calls.map(([line]) => line).join('\n')
        for (const key of SECRET_KEYS) {
            expect(printed).toContain(`Generated ${key} in .env.`)
            expect(printed).not.toContain(env.get(key) ?? '')
        }
    })
})
