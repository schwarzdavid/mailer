import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CliContext } from '../context.ts'
import { secretFingerprint } from '../secrets.ts'
import { recoveryKit } from './recovery-kit.ts'

describe('recoveryKit', () => {
    let projectDir: string

    function ctx(env: Record<string, string | undefined> = {}): CliContext {
        return {
            projectDir,
            assetsDir: projectDir,
            bakedVersion: '1.4.0',
            env,
            interactive: false,
            out: vi.fn<(line: string) => void>(),
        }
    }

    beforeEach(async () => {
        projectDir = await mkdtemp(join(tmpdir(), 'mailer-cli-kit-'))
        await writeFile(
            join(projectDir, '.env'),
            [
                'SITE_ADDRESS=admin.example.org',
                'MAIL_HOSTNAME=mx.example.net',
                'IMAGE_TAG=1.4.0',
                'DB_PASSWORD=file-db-password',
                'BACKEND_ENCRYPTION_SECRET=file-encryption-secret',
                '',
            ].join('\n'),
        )
    })

    it('lists the site, the mail hostname, the version and the secrets', async () => {
        const lines = await recoveryKit(ctx())
        expect(lines).toContain('Site: admin.example.org')
        expect(lines).toContain('Mail hostname: mx.example.net')
        expect(lines).toContain('Version: 1.4.0')
        expect(lines).toContain('DB_PASSWORD=file-db-password')
        expect(lines).toContain('BACKEND_ENCRYPTION_SECRET=file-encryption-secret')
    })

    it('takes a secret from the environment before .env', async () => {
        const lines = await recoveryKit(ctx({ DB_PASSWORD: 'env-db-password' }))
        expect(lines).toContain('DB_PASSWORD=env-db-password')
        expect(lines).not.toContain('DB_PASSWORD=file-db-password')
    })

    it('shows a missing secret as not available', async () => {
        const lines = await recoveryKit(ctx())
        expect(lines).toContain('BACKEND_JWT_SECRET=(not available)')
        expect(lines).toContain('MAIL_PASSWORD=(not available)')
    })

    it('ends with the fingerprint of the encryption secret', async () => {
        const lines = await recoveryKit(ctx({ BACKEND_ENCRYPTION_SECRET: 'env-encryption-secret' }))
        expect(lines.at(-1)).toBe(`Encryption secret fingerprint: ${secretFingerprint('env-encryption-secret')}`)
    })

    it('shows the fingerprint as not available without an encryption secret', async () => {
        await writeFile(join(projectDir, '.env'), 'IMAGE_TAG=1.4.0\n')
        const lines = await recoveryKit(ctx())
        expect(lines.at(-1)).toBe('Encryption secret fingerprint: (not available)')
    })
})
