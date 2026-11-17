import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

interface PackageJson {
    license: string
    files: string[]
    types: string
    exports: Record<string, string | Record<string, string>>
}

const packageRoot = join(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as PackageJson

function exportTargets(): string[] {
    return Object.values(packageJson.exports).flatMap((entry) =>
        typeof entry === 'string' ? [entry] : Object.values(entry),
    )
}

function distFiles(): string[] {
    return readdirSync(join(packageRoot, 'dist'), { recursive: true, encoding: 'utf8' })
}

describe('package shape', () => {
    it('has every exports target under dist', () => {
        for (const target of exportTargets()) {
            expect(existsSync(join(packageRoot, target))).toBe(true)
        }
    })

    it('publishes only dist, LICENSE and README.md', () => {
        expect(packageJson.files).toEqual(['dist', 'LICENSE', 'README.md'])
    })

    it('is MIT licensed', () => {
        expect(packageJson.license).toBe('MIT')
    })

    it('has a single module entry point beside the script bundle', () => {
        expect(Object.keys(packageJson.exports)).toEqual(['.', './client.iife.js'])
    })

    it('points the top-level types at the built declarations', () => {
        expect(packageJson.types).toBe('./dist/index.d.ts')
        expect(existsSync(join(packageRoot, packageJson.types))).toBe(true)
    })

    it('builds a self-contained script bundle without module syntax', () => {
        const script = readFileSync(join(packageRoot, 'dist', 'client.iife.js'), 'utf8')
        expect(script).not.toMatch(/^\s*(import|export)\s/m)
        expect(script).not.toMatch(/\bimport\s*\(|\bexport\s*\{/)
    })

    it('installs window.InboundForm when the script bundle runs', async () => {
        const script = readFileSync(join(packageRoot, 'dist', 'client.iife.js'), 'utf8')
        const fetchStub = vi.fn<typeof fetch>(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        token: 'stubbed',
                        notBefore: '2026-11-17T10:00:00.000Z',
                        expiresAt: '2026-11-17T10:30:00.000Z',
                        waitMs: 0,
                    }),
                    { status: 200, headers: { 'content-type': 'application/json' } },
                ),
            ),
        )
        const context: Record<string, unknown> = {
            document: { currentScript: { src: 'https://api.example.com/api/v1/forms/client.js?v=1' } },
            fetch: fetchStub,
            setTimeout,
            clearTimeout,
            AbortSignal,
            URL,
            URLSearchParams,
            Headers,
        }
        context.window = context

        runInNewContext(script, context)

        const inboundForm = context.InboundForm as { getToken(formKey: string): Promise<string> }
        expect(typeof inboundForm.getToken).toBe('function')
        await expect(inboundForm.getToken('kontakt')).resolves.toBe('stubbed')
        expect(fetchStub.mock.calls[0]?.[0]).toBe('https://api.example.com/api/v1/forms/kontakt/token')
    })

    it('keeps token internals out of the public declarations', () => {
        const declarations = readFileSync(join(packageRoot, 'dist', 'index.d.ts'), 'utf8')
        for (const name of ['issueToken', 'notBefore', 'receivedAt']) {
            expect(declarations).not.toContain(name)
        }
    })

    it('never imports the api workspace package from dist', () => {
        const emitted = distFiles().filter((file) => file.endsWith('.js') || file.endsWith('.d.ts'))
        expect(emitted.length).toBeGreaterThan(0)
        for (const file of emitted) {
            const content = readFileSync(join(packageRoot, 'dist', file), 'utf8')
            expect(content).not.toMatch(/from ['"]api['"]/)
        }
    })
})
