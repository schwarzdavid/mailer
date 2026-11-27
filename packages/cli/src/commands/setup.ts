import { rename, rm } from 'node:fs/promises'
import { isIPv4, isIPv6 } from 'node:net'
import { join } from 'node:path'
import type { CliContext } from '../context.ts'
import { EnvFile } from '../env-file.ts'
import { CliError, EXIT } from '../errors.ts'
import type { Prompter } from '../prompter.ts'
import { CURRENT_FORMAT, composeOrigin, detectFormat, resolveImageTag, writeAssets } from '../project.ts'
import { SECRET_KEYS, generateSecret, typedSecretProblem } from '../secrets.ts'
import type { SecretKey } from '../secrets.ts'

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

interface Settings {
    siteAddress: string
    mailHostname: string
    mailIpv4: string
    mailIpv6: string
}

interface SecretPlan {
    values: Partial<Record<SecretKey, string>>
    generated: SecretKey[]
    wrapper?: string
    shownOnce?: Record<SecretKey, string>
}

const REGISTRABLE_DOMAIN_WARNING =
    'mailer keeps one sender domain per registrable domain (the part you buy at a registrar), and its own sending domain already occupies the one of MAIL_HOSTNAME. ' +
    'With mx.example.com, no sender domain under example.com can be added later. ' +
    'Choose a MAIL_HOSTNAME under a domain your websites will not send from.'

function filled(value: string | undefined): string | undefined {
    return value === undefined || value === '' ? undefined : value
}

function trimmed(value: string | undefined): string | undefined {
    return filled(value?.trim())
}

function required(value: string): string | undefined {
    return value.trim() === '' ? 'A value is required' : undefined
}

function secretsModeOf(options: SetupOptions): SecretsMode | undefined {
    if (filled(options.secretsWrapper) === undefined) {
        return options.secrets
    }
    if (options.secrets !== undefined && options.secrets !== 'external') {
        throw new CliError('--secrets-wrapper works only with --secrets external.', EXIT.usage)
    }
    return 'external'
}

async function firstRecord(resolve: () => Promise<string[]>): Promise<string | undefined> {
    try {
        return (await resolve())[0]
    } catch {
        return undefined
    }
}

async function askSettings(
    env: EnvFile,
    options: SetupOptions,
    prompter: Prompter,
    resolver: HostResolver,
): Promise<Settings> {
    const siteAddress = (
        await prompter.text({
            message: 'SITE_ADDRESS: the domain the admin UI is served on',
            initial: trimmed(options.siteAddress) ?? trimmed(env.get('SITE_ADDRESS')),
            validate: required,
        })
    ).trim()
    prompter.note(REGISTRABLE_DOMAIN_WARNING)
    const mailHostname = (
        await prompter.text({
            message: 'MAIL_HOSTNAME: the platform sending domain (must differ from SITE_ADDRESS)',
            initial: trimmed(options.mailHostname) ?? trimmed(env.get('MAIL_HOSTNAME')),
            validate: (value) =>
                required(value) ??
                (value.trim() === siteAddress ? 'MAIL_HOSTNAME must differ from SITE_ADDRESS' : undefined),
        })
    ).trim()
    const resolved4 = await firstRecord(() => resolver.resolve4(mailHostname))
    const resolved6 = await firstRecord(() => resolver.resolve6(mailHostname))
    if (resolved4 === undefined && resolved6 === undefined) {
        prompter.note(`${mailHostname} does not resolve yet. Create its A and AAAA records before you send mail.`)
    }
    const mailIpv4 = (
        await prompter.text({
            message: 'MAIL_SERVER_IPV4: the public IPv4 address of this server',
            initial: trimmed(options.mailIpv4) ?? trimmed(env.get('MAIL_SERVER_IPV4')) ?? resolved4,
            validate: (value) => (isIPv4(value.trim()) ? undefined : 'Enter an IPv4 address'),
        })
    ).trim()
    const mailIpv6 = (
        await prompter.text({
            message: 'MAIL_SERVER_IPV6: the public IPv6 address of this server (optional)',
            initial: trimmed(options.mailIpv6) ?? trimmed(env.get('MAIL_SERVER_IPV6')) ?? resolved6,
            validate: (value) =>
                value.trim() === '' || isIPv6(value.trim()) ? undefined : 'Enter an IPv6 address or leave it empty',
        })
    ).trim()
    return { siteAddress, mailHostname, mailIpv4, mailIpv6 }
}

function settingsFromValues(env: EnvFile, options: SetupOptions): Settings {
    const siteAddress = trimmed(options.siteAddress) ?? trimmed(env.get('SITE_ADDRESS'))
    const mailHostname = trimmed(options.mailHostname) ?? trimmed(env.get('MAIL_HOSTNAME'))
    const mailIpv4 = trimmed(options.mailIpv4) ?? trimmed(env.get('MAIL_SERVER_IPV4'))
    const mailIpv6 = trimmed(options.mailIpv6) ?? trimmed(env.get('MAIL_SERVER_IPV6')) ?? ''
    if (siteAddress === undefined || mailHostname === undefined || mailIpv4 === undefined) {
        const missing = [
            siteAddress === undefined ? 'SITE_ADDRESS' : undefined,
            mailHostname === undefined ? 'MAIL_HOSTNAME' : undefined,
            mailIpv4 === undefined ? 'MAIL_SERVER_IPV4' : undefined,
        ].filter((key) => key !== undefined)
        throw new CliError(
            `Missing settings: ${missing.join(', ')}. Pass them as options or set them in .env.`,
            EXIT.usage,
        )
    }
    return { siteAddress, mailHostname, mailIpv4, mailIpv6 }
}

function checkSettings(settings: Settings): void {
    if (settings.mailHostname === settings.siteAddress) {
        throw new CliError('MAIL_HOSTNAME must differ from SITE_ADDRESS.', EXIT.usage)
    }
    if (!isIPv4(settings.mailIpv4)) {
        throw new CliError(`MAIL_SERVER_IPV4 is not an IPv4 address: ${settings.mailIpv4}`, EXIT.usage)
    }
    if (settings.mailIpv6 !== '' && !isIPv6(settings.mailIpv6)) {
        throw new CliError(`MAIL_SERVER_IPV6 is not an IPv6 address: ${settings.mailIpv6}`, EXIT.usage)
    }
}

async function chooseMode(
    existingWrapper: string | undefined,
    hasEmptySecret: boolean,
    options: SetupOptions,
    prompter: Prompter | undefined,
): Promise<SecretsMode> {
    if (options.secrets !== undefined) {
        return options.secrets
    }
    const current: SecretsMode = existingWrapper === undefined ? 'generate' : 'external'
    if (prompter === undefined || (existingWrapper === undefined && !hasEmptySecret)) {
        return current
    }
    return prompter.select<SecretsMode>({
        message: 'How should the secrets be provided?',
        options: [
            { value: 'generate', label: 'Generate them into .env' },
            { value: 'prompt', label: 'Type them in, written to .env' },
            { value: 'external', label: 'Keep them outside .env (secrets wrapper)' },
        ],
        initial: current,
    })
}

async function planExternal(
    existingWrapper: string | undefined,
    options: SetupOptions,
    prompter: Prompter | undefined,
): Promise<SecretPlan> {
    const plan: SecretPlan = { values: {}, generated: [], wrapper: filled(options.secretsWrapper) ?? existingWrapper }
    if (prompter === undefined) {
        if (plan.wrapper === undefined) {
            throw new CliError('External secrets need a wrapper: pass --secrets-wrapper <command>.', EXIT.usage)
        }
        return plan
    }
    plan.wrapper ??= await prompter.text({
        message: 'MAILER_SECRETS_WRAPPER: the command that runs docker compose with the secrets in its environment',
        validate: required,
    })
    if (
        await prompter.confirm({
            message: 'Generate the four secrets and show them once?',
            initial: existingWrapper === undefined,
        })
    ) {
        plan.shownOnce = {
            DB_PASSWORD: generateSecret(),
            BACKEND_JWT_SECRET: generateSecret(),
            BACKEND_ENCRYPTION_SECRET: generateSecret(),
            MAIL_PASSWORD: generateSecret(),
        }
    }
    return plan
}

async function planSecrets(env: EnvFile, options: SetupOptions, prompter: Prompter | undefined): Promise<SecretPlan> {
    const existingWrapper = filled(env.get('MAILER_SECRETS_WRAPPER'))
    const empty = SECRET_KEYS.filter((key) => !env.has(key))
    const mode = await chooseMode(existingWrapper, empty.length > 0, options, prompter)
    if (mode === 'external') {
        return planExternal(existingWrapper, options, prompter)
    }
    if (mode === 'prompt' && prompter === undefined) {
        throw new CliError('Typing secrets in needs an interactive terminal.', EXIT.usage)
    }
    const plan: SecretPlan = { values: {}, generated: [] }
    for (const key of empty) {
        const typed =
            mode === 'prompt' && prompter !== undefined
                ? await prompter.text({
                      message: `${key} (leave empty to generate)`,
                      validate: (value) => (value === '' ? undefined : typedSecretProblem(key, value)),
                  })
                : ''
        if (typed === '') {
            plan.values[key] = generateSecret()
            plan.generated.push(key)
        } else {
            plan.values[key] = typed
        }
    }
    return plan
}

async function keepEditedCompose(ctx: CliContext, prompter: Prompter): Promise<boolean> {
    if ((await composeOrigin(ctx.projectDir, ctx.assetsDir)) !== 'edited') {
        return false
    }
    await rename(join(ctx.projectDir, 'compose.yml'), join(ctx.projectDir, 'compose.yml.legacy'))
    prompter.note(
        'Your compose.yml was kept as compose.yml.legacy. Move the differences you still need into compose.override.yml.',
    )
    return true
}

function applySettings(env: EnvFile, settings: Settings, imageTag: string, secrets: SecretPlan): void {
    env.set('SITE_ADDRESS', settings.siteAddress)
    env.set('MAIL_HOSTNAME', settings.mailHostname)
    env.set('MAIL_SERVER_IPV4', settings.mailIpv4)
    if (settings.mailIpv6 !== '' || env.get('MAIL_SERVER_IPV6') !== undefined) {
        env.set('MAIL_SERVER_IPV6', settings.mailIpv6)
    }
    for (const key of ['DB_DATABASE', 'DB_USERNAME']) {
        if (!env.has(key)) {
            env.set(key, 'mailer')
        }
    }
    env.set('IMAGE_TAG', imageTag)
    env.set('MAILER_FORMAT_VERSION', String(CURRENT_FORMAT))
    if (secrets.wrapper !== undefined) {
        env.set('MAILER_SECRETS_WRAPPER', secrets.wrapper)
    }
    for (const key of SECRET_KEYS) {
        const value = secrets.values[key]
        if (value !== undefined) {
            env.set(key, value)
        }
    }
}

export async function runSetup(
    ctx: CliContext,
    requested: SetupOptions,
    prompter: Prompter,
    resolver: HostResolver,
): Promise<SetupResult> {
    const options: SetupOptions = { ...requested, secrets: secretsModeOf(requested) }
    const envPath = join(ctx.projectDir, '.env')
    const env = await EnvFile.read(envPath)
    const format = await detectFormat(ctx.projectDir)
    if (typeof format === 'number' && format > CURRENT_FORMAT) {
        throw new CliError('This installation is newer than the image; a downgrade is not supported.', EXIT.manual)
    }
    const asking = ctx.interactive && !options.yes
    const settings = asking ? await askSettings(env, options, prompter, resolver) : settingsFromValues(env, options)
    checkSettings(settings)
    const secrets = await planSecrets(env, options, asking ? prompter : undefined)
    const imageTag = resolveImageTag(options.imageTag ?? filled(env.get('IMAGE_TAG')), ctx.bakedVersion)

    const legacyComposeKept = format === 0 && (await keepEditedCompose(ctx, prompter))
    if (format === 0) {
        await rm(join(ctx.projectDir, 'setup.sh'), { force: true })
    }
    await writeAssets(ctx.projectDir, ctx.assetsDir)
    applySettings(env, settings, imageTag, secrets)
    await env.write(envPath)

    for (const key of secrets.generated) {
        ctx.out(`Generated ${key} in .env.`)
    }
    if (secrets.shownOnce !== undefined) {
        prompter.note(
            `Store these secrets now, they are not shown again:\n${SECRET_KEYS.map((key) => `${key}=${secrets.shownOnce?.[key]}`).join('\n')}`,
        )
    }
    return { generated: secrets.generated, legacyComposeKept }
}
