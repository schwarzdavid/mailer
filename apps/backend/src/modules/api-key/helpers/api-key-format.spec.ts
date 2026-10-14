import { describe, expect, it } from 'vitest'
import { generateApiKey, hashApiKey, matchesApiKeyHash, parseApiKeyPrefix } from './api-key-format.js'

describe('api key format', () => {
    it('generates keys of the documented shape whose prefix matches the key', () => {
        const { key, prefix, secretHash } = generateApiKey()

        expect(key).toMatch(/^sdm_[0-9A-Za-z]{8}_[A-Za-z0-9_-]{43}$/)
        expect(key.startsWith(`${prefix}_`)).toBe(true)
        expect(secretHash).toBe(hashApiKey(key))
        expect(secretHash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('parses the prefix of every generated key, even when the secret contains underscores', () => {
        for (let attempt = 0; attempt < 50; attempt++) {
            const { key, prefix } = generateApiKey()
            expect(parseApiKeyPrefix(key)).toBe(prefix)
        }
        expect(parseApiKeyPrefix(`sdm_abcdEFGH_${'_'.repeat(43)}`)).toBe('sdm_abcdEFGH')
    })

    it.each([
        '',
        'sdm_short_secret',
        'Bearer sdm_abcdEFGH_xxx',
        `abc_abcdEFGH_${'a'.repeat(43)}`,
        `sdm_abcdEFGH_${'a'.repeat(42)}`,
        `sdm_abcdEFGH_${'a'.repeat(44)}`,
        'eyJhbGciOiJIUzI1NiJ9.e30.sig',
    ])('rejects malformed key %j', (key) => {
        expect(parseApiKeyPrefix(key)).toBeNull()
    })

    it('matches only the key the hash was made from', () => {
        const { key, secretHash } = generateApiKey()
        const other = generateApiKey()

        expect(matchesApiKeyHash(key, secretHash)).toBe(true)
        expect(matchesApiKeyHash(other.key, secretHash)).toBe(false)
        expect(matchesApiKeyHash(key, 'not-hex')).toBe(false)
    })
})
