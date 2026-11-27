import { mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { CliError, EXIT } from './errors.ts'
import { releasedComposeHashes } from './legacy-templates.ts'
import { composeOrigin, detectFormat, resolveImageTag, writeAssets } from './project.ts'

const assetCompose = 'services:\n  proxy: {}\n'
function catchError(action: () => unknown): unknown {
    try {
        action()
    } catch (error) {
        return error
    }
    return undefined
}

const assetScript = '#!/bin/sh\necho mailer\n'

describe('project', () => {
    let projectDir: string
    let assetsDir: string

    beforeEach(async () => {
        projectDir = await mkdtemp(join(tmpdir(), 'mailer-cli-project-'))
        assetsDir = await mkdtemp(join(tmpdir(), 'mailer-cli-assets-'))
        await writeFile(join(assetsDir, 'compose.yml'), assetCompose)
        await writeFile(join(assetsDir, 'mailer.sh'), assetScript)
    })

    it('detectFormat treats a directory without compose.yml as fresh, even with a lone .env', async () => {
        expect(await detectFormat(projectDir)).toBe('fresh')
        await writeFile(join(projectDir, '.env'), 'MAILER_FORMAT_VERSION=1\n')
        expect(await detectFormat(projectDir)).toBe('fresh')
    })

    it('detectFormat returns 0 for a compose.yml without a numeric format version', async () => {
        await writeFile(join(projectDir, 'compose.yml'), assetCompose)
        expect(await detectFormat(projectDir)).toBe(0)
        await writeFile(join(projectDir, '.env'), 'MAILER_FORMAT_VERSION=abc\n')
        expect(await detectFormat(projectDir)).toBe(0)
    })

    it('detectFormat returns the recorded format version', async () => {
        await writeFile(join(projectDir, 'compose.yml'), assetCompose)
        await writeFile(join(projectDir, '.env'), 'MAILER_FORMAT_VERSION=1\n')
        expect(await detectFormat(projectDir)).toBe(1)
    })

    it('composeOrigin is absent without a compose.yml', async () => {
        expect(await composeOrigin(projectDir, assetsDir)).toBe('absent')
    })

    it('composeOrigin is current for the asset, ignoring CRLF', async () => {
        await writeFile(join(projectDir, 'compose.yml'), assetCompose.replaceAll('\n', '\r\n'))
        expect(await composeOrigin(projectDir, assetsDir)).toBe('current')
    })

    it('composeOrigin is edited for anything else', async () => {
        await writeFile(join(projectDir, 'compose.yml'), 'services: {}\n')
        expect(await composeOrigin(projectDir, assetsDir)).toBe('edited')
    })

    it('every released hash is a sha256 hex digest', () => {
        expect(releasedComposeHashes.length).toBeGreaterThan(0)
        for (const hash of releasedComposeHashes) {
            expect(hash).toMatch(/^[0-9a-f]{64}$/)
        }
    })

    it('writeAssets copies both files and leaves no temporary file', async () => {
        await writeAssets(projectDir, assetsDir)
        expect((await readdir(projectDir)).sort()).toEqual(['compose.yml', 'mailer.sh'])
        expect(await readFile(join(projectDir, 'compose.yml'), 'utf8')).toBe(assetCompose)
        expect(await readFile(join(projectDir, 'mailer.sh'), 'utf8')).toBe(assetScript)
    })

    it.skipIf(process.platform === 'win32')('writeAssets makes mailer.sh executable', async () => {
        await writeAssets(projectDir, assetsDir)
        expect((await stat(join(projectDir, 'mailer.sh'))).mode & 0o777).toBe(0o755)
    })

    it('writeAssets replaces existing files', async () => {
        await writeFile(join(projectDir, 'compose.yml'), 'old\n')
        await writeAssets(projectDir, assetsDir)
        expect(await readFile(join(projectDir, 'compose.yml'), 'utf8')).toBe(assetCompose)
    })

    it('resolveImageTag returns a requested tag other than latest as is', () => {
        expect(resolveImageTag('ci', '1.2.3')).toBe('ci')
    })

    it('resolveImageTag falls back to the baked version', () => {
        expect(resolveImageTag(undefined, '1.2.3')).toBe('1.2.3')
        expect(resolveImageTag('latest', '1.2.3')).toBe('1.2.3')
    })

    it('resolveImageTag refuses to pin a development image', () => {
        expect(() => resolveImageTag('latest', '0.0.0-dev')).toThrow(CliError)
        expect(() => resolveImageTag(undefined, '0.0.0-dev')).toThrow(
            'This image carries no release version; pass --image-tag <version>.',
        )
        expect(catchError(() => resolveImageTag(undefined, '0.0.0-dev'))).toMatchObject({ exitCode: EXIT.usage })
    })
})
