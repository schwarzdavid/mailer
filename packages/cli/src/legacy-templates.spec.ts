import { describe, expect, it } from 'vitest'
import { releasedComposeHashes } from './legacy-templates.ts'

describe('releasedComposeHashes', () => {
    it('holds unique sha256 hex digests', () => {
        expect(releasedComposeHashes.length).toBeGreaterThan(0)
        expect(new Set(releasedComposeHashes).size).toBe(releasedComposeHashes.length)
        for (const hash of releasedComposeHashes) {
            expect(hash).toMatch(/^[0-9a-f]{64}$/)
        }
    })
})
