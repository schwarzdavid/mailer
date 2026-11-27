import { join } from 'node:path'
import type { CliContext } from '../context.ts'
import { EnvFile } from '../env-file.ts'
import { SECRET_KEYS, secretFingerprint } from '../secrets.ts'

const NOT_AVAILABLE = '(not available)'

function filled(value: string | undefined): string | undefined {
    return value === undefined || value === '' ? undefined : value
}

export async function recoveryKit(ctx: CliContext): Promise<string[]> {
    const env = await EnvFile.read(join(ctx.projectDir, '.env'))
    const secrets = SECRET_KEYS.map((key) => ({ key, value: filled(ctx.env[key]) ?? filled(env.get(key)) }))
    const encryptionSecret = secrets.find(({ key }) => key === 'BACKEND_ENCRYPTION_SECRET')?.value
    const fingerprint = encryptionSecret === undefined ? NOT_AVAILABLE : secretFingerprint(encryptionSecret)
    return [
        `Site: ${filled(env.get('SITE_ADDRESS')) ?? NOT_AVAILABLE}`,
        `Mail hostname: ${filled(env.get('MAIL_HOSTNAME')) ?? NOT_AVAILABLE}`,
        `Version: ${filled(env.get('IMAGE_TAG')) ?? NOT_AVAILABLE}`,
        ...secrets.map(({ key, value }) => `${key}=${value ?? NOT_AVAILABLE}`),
        `Encryption secret fingerprint: ${fingerprint}`,
    ]
}
