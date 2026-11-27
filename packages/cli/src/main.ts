import { join } from 'node:path'
import { parseArgs } from 'node:util'
import type { CliContext } from './context.ts'
import { migrateProject } from './commands/migrate-project.ts'
import { recoveryKit } from './commands/recovery-kit.ts'
import { runSetup } from './commands/setup.ts'
import type { HostResolver, SecretsMode, SetupOptions } from './commands/setup.ts'
import { CliError, EXIT } from './errors.ts'
import type { Prompter } from './prompter.ts'

export interface MainDeps {
    prompter: Prompter
    resolver: HostResolver
    out: (line: string) => void
    err: (line: string) => void
}

type OptionSpecs = Record<string, { type: 'string' | 'boolean' }>

const SECRETS_MODES: readonly string[] = ['generate', 'prompt', 'external']
const RECOVERY_KIT_REMINDER =
    'Store this recovery kit in a password manager. A database backup is worthless without BACKEND_ENCRYPTION_SECRET.'

function parseOptions<T extends OptionSpecs>(argv: string[], options: T) {
    try {
        return parseArgs({ args: argv, options, strict: true, allowPositionals: false }).values
    } catch (error) {
        throw new CliError((error as Error).message, EXIT.usage)
    }
}

function contextFor(env: Record<string, string | undefined>, deps: MainDeps): CliContext {
    return {
        projectDir: env.MAILER_PROJECT_DIR ?? '/project',
        assetsDir: env.MAILER_ASSETS_DIR ?? join(import.meta.dirname, 'assets'),
        bakedVersion: env.MAILER_VERSION ?? '0.0.0-dev',
        env,
        interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
        out: deps.out,
    }
}

async function setupCommand(argv: string[], ctx: CliContext, deps: MainDeps): Promise<void> {
    const values = parseOptions(argv, {
        yes: { type: 'boolean' },
        'image-tag': { type: 'string' },
        'site-address': { type: 'string' },
        'mail-hostname': { type: 'string' },
        'mail-ipv4': { type: 'string' },
        'mail-ipv6': { type: 'string' },
        secrets: { type: 'string' },
        'secrets-wrapper': { type: 'string' },
    })
    if (values.secrets !== undefined && !SECRETS_MODES.includes(values.secrets)) {
        throw new CliError('--secrets must be one of: generate, prompt, external', EXIT.usage)
    }
    const options: SetupOptions = {
        yes: values.yes ?? false,
        imageTag: values['image-tag'],
        siteAddress: values['site-address'],
        mailHostname: values['mail-hostname'],
        mailIpv4: values['mail-ipv4'],
        mailIpv6: values['mail-ipv6'],
        secrets: values.secrets as SecretsMode | undefined,
        secretsWrapper: values['secrets-wrapper'],
    }
    const result = await runSetup(ctx, options, deps.prompter, deps.resolver)
    if (result.generated.length > 0) {
        for (const line of await recoveryKit(ctx)) {
            deps.out(line)
        }
        deps.out(RECOVERY_KIT_REMINDER)
    }
}

async function migrateCommand(argv: string[], ctx: CliContext): Promise<void> {
    const values = parseOptions(argv, { 'image-tag': { type: 'string' }, 'dry-run': { type: 'boolean' } })
    if (values['image-tag'] === undefined) {
        throw new CliError('migrate-project needs --image-tag <tag>.', EXIT.usage)
    }
    await migrateProject(ctx, { imageTag: values['image-tag'], dryRun: values['dry-run'] ?? false })
}

async function recoveryKitCommand(argv: string[], ctx: CliContext): Promise<void> {
    parseOptions(argv, {})
    for (const line of await recoveryKit(ctx)) {
        ctx.out(line)
    }
}

async function dispatch(argv: string[], env: Record<string, string | undefined>, deps: MainDeps): Promise<void> {
    const ctx = contextFor(env, deps)
    const [command, ...rest] = argv
    switch (command) {
        case '--version':
            deps.out(ctx.bakedVersion)
            return
        case 'setup':
            return setupCommand(rest, ctx, deps)
        case 'migrate-project':
            return migrateCommand(rest, ctx)
        case 'recovery-kit':
            return recoveryKitCommand(rest, ctx)
        default:
            throw new CliError(
                command === undefined
                    ? 'Missing command: setup, migrate-project or recovery-kit.'
                    : `Unknown command: ${command}`,
                EXIT.usage,
            )
    }
}

export async function run(argv: string[], env: Record<string, string | undefined>, deps: MainDeps): Promise<number> {
    try {
        await dispatch(argv, env, deps)
        return EXIT.ok
    } catch (error) {
        if (error instanceof CliError) {
            deps.err(error.message)
            return error.exitCode
        }
        deps.err(error instanceof Error ? error.message : String(error))
        return EXIT.failure
    }
}
