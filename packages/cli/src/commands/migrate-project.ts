import { copyFile, mkdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { CliContext } from '../context.ts'
import { EnvFile } from '../env-file.ts'
import { CliError, EXIT } from '../errors.ts'
import { projectMigrations } from '../migrations/index.ts'
import type { ProjectMigration } from '../migrations/index.ts'
import { CURRENT_FORMAT, detectFormat, writeAssets } from '../project.ts'

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

async function copyProjectFiles(fromDir: string, toDir: string): Promise<void> {
    for (const name of SNAPSHOT_FILES) {
        await copyFile(join(fromDir, name), join(toDir, name))
    }
}

async function takeSnapshot(projectDir: string): Promise<string> {
    const snapshotDir = join(projectDir, 'backups', 'snapshots', snapshotName(new Date()))
    await mkdir(snapshotDir, { recursive: true, mode: PRIVATE_DIRECTORY })
    await copyProjectFiles(projectDir, snapshotDir)
    return snapshotDir
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
    if (previousTag !== undefined && previousTag !== options.imageTag) {
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
        throw new CliError('This directory was not set up by mailer.sh; run: sh mailer.sh setup', EXIT.manual)
    }
    if (format > targetFormat) {
        throw new CliError('This installation is newer than the image; a downgrade is not supported.', EXIT.manual)
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
            await copyProjectFiles(snapshotDir, ctx.projectDir)
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
