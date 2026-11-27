import { createHash, randomUUID } from 'node:crypto'
import { chmod, copyFile, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { CliError, EXIT } from './errors.ts'
import { EnvFile } from './env-file.ts'
import { releasedComposeHashes } from './legacy-templates.ts'

export { releasedComposeHashes }

export const CURRENT_FORMAT = 1
export type ProjectFormat = 'fresh' | number
export type ComposeOrigin = 'absent' | 'current' | 'released' | 'edited'

const DEVELOPMENT_VERSION = '0.0.0-dev'

async function readIfPresent(path: string): Promise<string | undefined> {
    try {
        return await readFile(path, 'utf8')
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return undefined
        }
        throw error
    }
}

function hashNormalised(content: string): string {
    return createHash('sha256').update(content.replaceAll('\r\n', '\n')).digest('hex')
}

export async function detectFormat(projectDir: string): Promise<ProjectFormat> {
    if ((await readIfPresent(join(projectDir, 'compose.yml'))) === undefined) {
        return 'fresh'
    }
    const env = await EnvFile.read(join(projectDir, '.env'))
    const recorded = env.get('MAILER_FORMAT_VERSION')
    return recorded !== undefined && /^\d+$/.test(recorded) ? Number(recorded) : 0
}

export async function composeOrigin(projectDir: string, assetsDir: string): Promise<ComposeOrigin> {
    const content = await readIfPresent(join(projectDir, 'compose.yml'))
    if (content === undefined) {
        return 'absent'
    }
    const hash = hashNormalised(content)
    if (hash === hashNormalised(await readFile(join(assetsDir, 'compose.yml'), 'utf8'))) {
        return 'current'
    }
    return releasedComposeHashes.includes(hash) ? 'released' : 'edited'
}

export function resolveImageTag(requested: string | undefined, bakedVersion: string): string {
    if (requested !== undefined && requested !== 'latest') {
        return requested
    }
    if (bakedVersion === DEVELOPMENT_VERSION) {
        throw new CliError('This image carries no release version; pass --image-tag <version>.', EXIT.usage)
    }
    return bakedVersion
}

async function copyAtomically(source: string, target: string, mode?: number): Promise<void> {
    const temporary = `${target}.${randomUUID()}.tmp`
    try {
        await copyFile(source, temporary)
        if (mode !== undefined) {
            await chmod(temporary, mode)
        }
        await rename(temporary, target)
    } catch (error) {
        await rm(temporary, { force: true })
        throw error
    }
}

export async function writeAssets(projectDir: string, assetsDir: string): Promise<void> {
    await copyAtomically(join(assetsDir, 'compose.yml'), join(projectDir, 'compose.yml'))
    await copyAtomically(join(assetsDir, 'mailer.sh'), join(projectDir, 'mailer.sh'), 0o755)
}
