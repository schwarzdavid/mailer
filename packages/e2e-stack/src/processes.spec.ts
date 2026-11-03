import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { freePort, waitForLogLine } from './processes.ts'

describe('freePort', () => {
    it('returns a port in the dynamic range', async () => {
        const port = await freePort()
        expect(port).toBeGreaterThan(1024)
        expect(port).toBeLessThanOrEqual(65535)
    })
})

describe('waitForLogLine', () => {
    it('resolves with the match once the pattern appears', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'e2e-stack-'))
        const logFile = join(dir, 'backend.log')
        setTimeout(() => void writeFile(logFile, 'Setup token: abc123\n'), 150)
        const match = await waitForLogLine(logFile, /Setup token: (\w+)/, 2_000)
        expect(match[1]).toBe('abc123')
    })

    it('rejects with the log tail after the timeout', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'e2e-stack-'))
        const logFile = join(dir, 'backend.log')
        await writeFile(logFile, 'nothing useful\n')
        await expect(waitForLogLine(logFile, /never/, 300)).rejects.toThrow(/nothing useful/)
    })
})
