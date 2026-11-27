import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { CliContext } from '../context.ts'
import { EnvFile } from '../env-file.ts'
import { CliError, EXIT } from '../errors.ts'
import { projectMigrations } from '../migrations/index.ts'
import type { ProjectMigration } from '../migrations/index.ts'
import { CURRENT_FORMAT, detectFormat, hasComposeFile, writeAssets } from '../project.ts'

export interface MigrateOptions {
    imageTag: string
    dryRun: boolean
}

export interface MigrateResult {
    from: number
    to: number
    snapshotDir: string | undefined
}

const LOCK_NAME = '.update-lock'
const SNAPSHOT_FILES = ['compose.yml', '.env', 'mailer.sh']
const PRIVATE_DIRECTORY = 0o700
const NOT_SET_UP = 'This directory was not set up by mailer.sh; run: sh mailer.sh setup'

function snapshotName(now: Date): string {
    return now
        .toISOString()
        .replace(/\.\d+Z$/, 'Z')
        .replaceAll(/[-:]/g, '')
}

function stepsBetween(from: number, to: number, migrations: readonly ProjectMigration[]): ProjectMigration[] {
    const steps: ProjectMigration[] = []
    for (let format = from; format < to; format++) {
        const step = migrations.find((migration) => migration.from === format)
        if (step === undefined) {
            throw new CliError(`No migration from format ${format} is available; manual action is needed.`, EXIT.manual)
        }
        steps.push(step)
    }
    return steps
}

async function takeLock(lockPath: string): Promise<void> {
    try {
        await mkdir(lockPath)
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new CliError('Another update is running. If none is, remove .update-lock and try again.')
        }
        throw error
    }
}

async function takeSnapshot(projectDir: string): Promise<string> {
    const snapshotDir = join(projectDir, 'backups', 'snapshots', snapshotName(new Date()))
    await mkdir(snapshotDir, { recursive: true, mode: PRIVATE_DIRECTORY })
    for (const name of SNAPSHOT_FILES) {
        await copyFile(join(projectDir, name), join(snapshotDir, name))
    }
    return snapshotDir
}

async function contentOrUndefined(path: string): Promise<Buffer | undefined> {
    try {
        return await readFile(path)
    } catch {
        return undefined
    }
}

async function restoreFile(snapshotDir: string, projectDir: string, name: string): Promise<void> {
    const saved = join(snapshotDir, name)
    const target = join(projectDir, name)
    const current = await contentOrUndefined(target)
    if (current?.equals(await readFile(saved))) {
        return
    }
    const temporary = join(projectDir, `.${name}.${randomUUID()}.tmp`)
    try {
        await copyFile(saved, temporary)
        await rename(temporary, target)
    } catch (error) {
        await rm(temporary, { force: true })
        throw error
    }
}

async function restoreSnapshot(snapshotDir: string, projectDir: string, cause: unknown): Promise<void> {
    try {
        for (const name of SNAPSHOT_FILES) {
            await restoreFile(snapshotDir, projectDir, name)
        }
    } catch (restoreError) {
        throw new CliError(
            `${sentence(cause)} Restoring the project files failed as well: ${sentence(restoreError)} The previous files are in backups/snapshots/${basename(snapshotDir)}.`,
        )
    }
}

function sentence(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return /[.!?]$/.test(message) ? message : `${message}.`
}

async function applyMigration(
    ctx: CliContext,
    options: MigrateOptions,
    targetFormat: number,
    steps: readonly ProjectMigration[],
): Promise<void> {
    const envPath = join(ctx.projectDir, '.env')
    const env = await EnvFile.read(envPath)
    for (const step of steps) {
        await step.run(ctx.projectDir, env)
    }
    await writeAssets(ctx.projectDir, ctx.assetsDir)
    const previousTag = env.get('IMAGE_TAG')
    if (previousTag !== undefined && previousTag !== '' && previousTag !== options.imageTag) {
        env.set('MAILER_PREVIOUS_IMAGE_TAG', previousTag)
    }
    env.set('IMAGE_TAG', options.imageTag)
    env.set('MAILER_FORMAT_VERSION', String(targetFormat))
    await env.write(envPath)
}

export async function migrateProjectTo(
    ctx: CliContext,
    options: MigrateOptions,
    targetFormat: number,
    migrations: readonly ProjectMigration[],
): Promise<MigrateResult> {
    const format = await detectFormat(ctx.projectDir)
    if (format === 'fresh' || format === 0) {
        throw new CliError(NOT_SET_UP, EXIT.manual)
    }
    if (format > targetFormat) {
        throw new CliError('This installation is newer than the image; a downgrade is not supported.', EXIT.manual)
    }
    if (!(await hasComposeFile(ctx.projectDir))) {
        throw new CliError(NOT_SET_UP, EXIT.manual)
    }
    const steps = stepsBetween(format, targetFormat, migrations)
    if (options.dryRun) {
        return { from: format, to: targetFormat, snapshotDir: undefined }
    }

    const lockPath = join(ctx.projectDir, LOCK_NAME)
    await takeLock(lockPath)
    let snapshotDir: string
    try {
        snapshotDir = await takeSnapshot(ctx.projectDir)
    } catch (error) {
        await rm(lockPath, { recursive: true, force: true })
        throw error
    }
    try {
        await applyMigration(ctx, options, targetFormat, steps)
    } catch (error) {
        try {
            await restoreSnapshot(snapshotDir, ctx.projectDir, error)
        } finally {
            await rm(lockPath, { recursive: true, force: true })
        }
        throw error
    }
    ctx.out(`Snapshot: backups/snapshots/${basename(snapshotDir)}`)
    return { from: format, to: targetFormat, snapshotDir }
}

export function migrateProject(
    ctx: CliContext,
    options: MigrateOptions,
    migrations: readonly ProjectMigration[] = projectMigrations,
): Promise<MigrateResult> {
    return migrateProjectTo(ctx, options, CURRENT_FORMAT, migrations)
}
