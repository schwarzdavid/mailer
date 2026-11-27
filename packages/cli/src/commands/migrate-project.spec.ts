import { existsSync, readdirSync } from 'node:fs'
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Mock } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CliContext } from '../context.ts'
import { EnvFile } from '../env-file.ts'
import type { CliError } from '../errors.ts'
import { CURRENT_FORMAT } from '../project.ts'
import { migrateProject, migrateProjectTo } from './migrate-project.ts'
import type { ProjectMigration } from '../migrations/index.ts'

const assetCompose = 'services:\n  proxy: {}\n'
const assetScript = '#!/bin/sh\necho mailer\n'
const fixturesDir = join(import.meta.dirname, '../../test/fixtures')
const fixtureNames = readdirSync(fixturesDir)

async function listing(directory: string): Promise<string[]> {
    return (await readdir(directory, { recursive: true })).sort()
}

async function copyFixture(name: string, projectDir: string): Promise<void> {
    await cp(join(fixturesDir, name), projectDir, { recursive: true })
    await rename(join(projectDir, 'env'), join(projectDir, '.env'))
}

async function errorOf(promise: Promise<unknown>): Promise<CliError | undefined> {
    try {
        await promise
    } catch (error) {
        return error as CliError
    }
    return undefined
}

describe('migrateProject', () => {
    let projectDir: string
    let assetsDir: string
    let out: Mock<(line: string) => void>

    function ctx(): CliContext {
        return { projectDir, assetsDir, bakedVersion: '1.4.0', env: {}, interactive: false, out }
    }

    async function snapshotOf(): Promise<Record<string, string>> {
        const files: Record<string, string> = {}
        for (const name of ['compose.yml', '.env', 'mailer.sh']) {
            files[name] = await readFile(join(projectDir, name), 'utf8')
        }
        return files
    }

    beforeEach(async () => {
        projectDir = await mkdtemp(join(tmpdir(), 'mailer-cli-migrate-'))
        assetsDir = await mkdtemp(join(tmpdir(), 'mailer-cli-migrate-assets-'))
        await writeFile(join(assetsDir, 'compose.yml'), assetCompose)
        await writeFile(join(assetsDir, 'mailer.sh'), assetScript)
        out = vi.fn<(line: string) => void>()
    })

    it.each(fixtureNames)('migrates the %s fixture to the current format', async (name) => {
        await copyFixture(name, projectDir)
        const fixtureCompose = await readFile(join(projectDir, 'compose.yml'), 'utf8')
        const result = await migrateProject(ctx(), { imageTag: '9.9.9', dryRun: false })
        const env = await EnvFile.read(join(projectDir, '.env'))
        expect(result.to).toBe(CURRENT_FORMAT)
        expect(env.get('MAILER_FORMAT_VERSION')).toBe(String(CURRENT_FORMAT))
        expect(env.get('IMAGE_TAG')).toBe('9.9.9')
        expect(env.get('MAILER_PREVIOUS_IMAGE_TAG')).toBe('1.0.0')
        expect(env.get('CUSTOM_KEY')).toBe('keep')
        expect(await readFile(join(projectDir, 'compose.yml'), 'utf8')).toBe(assetCompose)
        expect(await readFile(join(projectDir, 'mailer.sh'), 'utf8')).toBe(assetScript)
        expect(await readFile(join(result.snapshotDir!, 'compose.yml'), 'utf8')).toBe(fixtureCompose)
        expect(existsSync(join(projectDir, '.update-lock'))).toBe(true)
    })

    it('snapshots the three files under backups/snapshots and reports the relative path', async () => {
        await copyFixture('format-1', projectDir)
        const before = await snapshotOf()
        const result = await migrateProject(ctx(), { imageTag: '9.9.9', dryRun: false })
        const name = result.snapshotDir!.split(/[\\/]/).pop()!
        expect(name).toMatch(/^\d{8}T\d{6}Z$/)
        expect(result.snapshotDir).toBe(join(projectDir, 'backups', 'snapshots', name))
        expect(out).toHaveBeenCalledWith(`Snapshot: backups/snapshots/${name}`)
        for (const [file, content] of Object.entries(before)) {
            expect(await readFile(join(result.snapshotDir!, file), 'utf8')).toBe(content)
        }
    })

    it('does not record a previous image tag when the tag stays the same', async () => {
        await copyFixture('format-1', projectDir)
        await migrateProject(ctx(), { imageTag: '1.0.0', dryRun: false })
        const env = await EnvFile.read(join(projectDir, '.env'))
        expect(env.has('MAILER_PREVIOUS_IMAGE_TAG')).toBe(false)
        expect(env.get('IMAGE_TAG')).toBe('1.0.0')
    })

    it('does not record an empty image tag as the previous one', async () => {
        await copyFixture('format-1', projectDir)
        const env = await EnvFile.read(join(projectDir, '.env'))
        env.set('IMAGE_TAG', '')
        await env.write(join(projectDir, '.env'))
        await migrateProject(ctx(), { imageTag: '9.9.9', dryRun: false })
        const migrated = await EnvFile.read(join(projectDir, '.env'))
        expect(migrated.get('MAILER_PREVIOUS_IMAGE_TAG')).toBeUndefined()
        expect(migrated.get('IMAGE_TAG')).toBe('9.9.9')
    })

    it('reports manual action for a recorded format without compose.yml', async () => {
        await copyFixture('format-1', projectDir)
        await rm(join(projectDir, 'compose.yml'))
        const before = await listing(projectDir)
        const error = await errorOf(migrateProject(ctx(), { imageTag: '9.9.9', dryRun: false }))
        expect(error?.exitCode).toBe(3)
        expect(error?.message).toBe('This directory was not set up by mailer.sh; run: sh mailer.sh setup')
        expect(await listing(projectDir)).toEqual(before)
    })

    it('reports a format newer than the image even without compose.yml', async () => {
        await copyFixture('format-1', projectDir)
        await rm(join(projectDir, 'compose.yml'))
        const env = await EnvFile.read(join(projectDir, '.env'))
        env.set('MAILER_FORMAT_VERSION', '99')
        await env.write(join(projectDir, '.env'))
        const error = await errorOf(migrateProject(ctx(), { imageTag: '9.9.9', dryRun: false }))
        expect(error?.exitCode).toBe(3)
        expect(error?.message).toBe('This installation is newer than the image; a downgrade is not supported.')
    })

    it('--dry-run changes nothing and takes no lock', async () => {
        await copyFixture('format-1', projectDir)
        const before = await listing(projectDir)
        const content = await snapshotOf()
        const result = await migrateProject(ctx(), { imageTag: '9.9.9', dryRun: true })
        expect(result).toEqual({ from: 1, to: CURRENT_FORMAT, snapshotDir: undefined })
        expect(await listing(projectDir)).toEqual(before)
        expect(await snapshotOf()).toEqual(content)
        expect(existsSync(join(projectDir, '.update-lock'))).toBe(false)
        expect(out).not.toHaveBeenCalled()
    })

    it('reports manual action for a directory mailer.sh did not set up', async () => {
        await writeFile(join(projectDir, 'unrelated.txt'), 'x')
        const before = await listing(projectDir)
        const error = await errorOf(migrateProject(ctx(), { imageTag: '9.9.9', dryRun: false }))
        expect(error?.exitCode).toBe(3)
        expect(error?.message).toBe('This directory was not set up by mailer.sh; run: sh mailer.sh setup')
        expect(await listing(projectDir)).toEqual(before)
    })

    it('reports manual action for a legacy installation without a format version', async () => {
        await copyFixture('format-1', projectDir)
        const env = await EnvFile.read(join(projectDir, '.env'))
        env.set('MAILER_FORMAT_VERSION', '')
        await env.write(join(projectDir, '.env'))
        const before = await listing(projectDir)
        const error = await errorOf(migrateProject(ctx(), { imageTag: '9.9.9', dryRun: false }))
        expect(error?.exitCode).toBe(3)
        expect(await listing(projectDir)).toEqual(before)
    })

    it('reports manual action for a format newer than the image', async () => {
        await copyFixture('format-1', projectDir)
        const env = await EnvFile.read(join(projectDir, '.env'))
        env.set('MAILER_FORMAT_VERSION', '99')
        await env.write(join(projectDir, '.env'))
        const before = await listing(projectDir)
        const content = await snapshotOf()
        const error = await errorOf(migrateProject(ctx(), { imageTag: '9.9.9', dryRun: false }))
        expect(error?.exitCode).toBe(3)
        expect(error?.message).toBe('This installation is newer than the image; a downgrade is not supported.')
        expect(await listing(projectDir)).toEqual(before)
        expect(await snapshotOf()).toEqual(content)
    })

    it('reports manual action, before any write, when a migration step is missing', async () => {
        await copyFixture('format-1', projectDir)
        const before = await listing(projectDir)
        const content = await snapshotOf()
        const error = await errorOf(migrateProjectTo(ctx(), { imageTag: '9.9.9', dryRun: false }, 2, []))
        expect(error?.exitCode).toBe(3)
        expect(await listing(projectDir)).toEqual(before)
        expect(await snapshotOf()).toEqual(content)
    })

    it('refuses a second run while the lock exists and leaves it', async () => {
        await copyFixture('format-1', projectDir)
        await migrateProject(ctx(), { imageTag: '9.9.9', dryRun: false })
        const before = await snapshotOf()
        const error = await errorOf(migrateProject(ctx(), { imageTag: '9.9.10', dryRun: false }))
        expect(error?.exitCode).toBe(1)
        expect(error?.message).toBe('Another update is running. If none is, remove .update-lock and try again.')
        expect(existsSync(join(projectDir, '.update-lock'))).toBe(true)
        expect(await snapshotOf()).toEqual(before)
    })

    it('runs the migrations in order from the detected format', async () => {
        await copyFixture('format-1', projectDir)
        const order: number[] = []
        const migrations: ProjectMigration[] = [
            { from: 1, run: () => Promise.resolve(void order.push(1)) },
            { from: 2, run: () => Promise.resolve(void order.push(2)) },
        ]
        const result = await migrateProjectTo(ctx(), { imageTag: '9.9.9', dryRun: false }, 3, migrations)
        const env = await EnvFile.read(join(projectDir, '.env'))
        expect(order).toEqual([1, 2])
        expect(result.to).toBe(3)
        expect(env.get('MAILER_FORMAT_VERSION')).toBe('3')
    })

    it('restores the snapshot and releases the lock when a migration throws', async () => {
        await copyFixture('format-1', projectDir)
        const before = await snapshotOf()
        const failing: ProjectMigration = {
            from: 1,
            run: async (dir, env) => {
                env.set('HALF_DONE', 'yes')
                await writeFile(join(dir, 'compose.yml'), 'broken')
                throw new Error('boom')
            },
        }
        const files = await readdir(projectDir)
        const error = await errorOf(migrateProjectTo(ctx(), { imageTag: '9.9.9', dryRun: false }, 2, [failing]))
        expect(error?.message).toBe('boom')
        expect(await snapshotOf()).toEqual(before)
        expect(existsSync(join(projectDir, '.update-lock'))).toBe(false)
        expect(existsSync(join(projectDir, 'backups', 'snapshots'))).toBe(true)
        expect((await readdir(projectDir)).sort()).toEqual([...files, 'backups'].sort())
    })

    it('restores only the files that differ, by replacing them', async () => {
        await copyFixture('format-1', projectDir)
        const before = await snapshotOf()
        const inode = async (name: string) => (await stat(join(projectDir, name), { bigint: true })).ino
        const composeInode = await inode('compose.yml')
        await chmod(join(projectDir, 'mailer.sh'), 0o444)
        const failing: ProjectMigration = {
            from: 1,
            run: async (dir) => {
                await writeFile(join(dir, 'compose.yml'), 'broken')
                throw new Error('boom')
            },
        }
        const error = await errorOf(migrateProjectTo(ctx(), { imageTag: '9.9.9', dryRun: false }, 2, [failing]))
        await chmod(join(projectDir, 'mailer.sh'), 0o644)
        expect(error?.message).toBe('boom')
        expect(await snapshotOf()).toEqual(before)
        expect(await inode('compose.yml')).not.toBe(composeInode)
        expect(existsSync(join(projectDir, '.update-lock'))).toBe(false)
    })

    it('keeps the cause and names the snapshot when the restore fails as well', async () => {
        await copyFixture('format-1', projectDir)
        const failing: ProjectMigration = {
            from: 1,
            run: async (dir) => {
                await rm(join(dir, 'compose.yml'))
                await mkdir(join(dir, 'compose.yml'))
                await writeFile(join(dir, 'compose.yml', 'blocker'), 'x')
                throw new Error('boom')
            },
        }
        const error = await errorOf(migrateProjectTo(ctx(), { imageTag: '9.9.9', dryRun: false }, 2, [failing]))
        const [name] = await readdir(join(projectDir, 'backups', 'snapshots'))
        expect(error?.message).toMatch(/^boom/)
        expect(error?.message).toMatch(new RegExp(` The previous files are in backups/snapshots/${name}\\.$`))
        expect(existsSync(join(projectDir, '.update-lock'))).toBe(false)
        expect(
            (await readdir(projectDir)).filter((entry) => entry.includes('.tmp') || entry.includes('restore')),
        ).toEqual([])
    })

    it.skipIf(process.platform === 'win32')('keeps backups and the snapshot private', async () => {
        await copyFixture('format-1', projectDir)
        const result = await migrateProject(ctx(), { imageTag: '9.9.9', dryRun: false })
        expect((await stat(join(projectDir, 'backups'))).mode & 0o777).toBe(0o700)
        expect((await stat(join(projectDir, 'backups', 'snapshots'))).mode & 0o777).toBe(0o700)
        expect((await stat(result.snapshotDir!)).mode & 0o777).toBe(0o700)
        expect((await stat(join(result.snapshotDir!, '.env'))).mode & 0o077).toBe(0)
    })

    it('restores the snapshot when writing the assets fails', async () => {
        await copyFixture('format-1', projectDir)
        const before = await snapshotOf()
        await rename(join(assetsDir, 'mailer.sh'), join(assetsDir, 'mailer.sh.gone'))
        const error = await errorOf(migrateProject(ctx(), { imageTag: '9.9.9', dryRun: false }))
        expect(error).toBeDefined()
        expect(await snapshotOf()).toEqual(before)
        expect(existsSync(join(projectDir, '.update-lock'))).toBe(false)
    })
})
