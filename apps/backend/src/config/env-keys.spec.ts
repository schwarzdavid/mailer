import { describe, expect, it } from 'vitest'
import { envShape } from './env.schema.js'
import { listEnvKeys } from './env-keys.js'

describe('listEnvKeys', () => {
    it('lists every key of the env schema exactly once, sorted', () => {
        const keys = listEnvKeys()
        expect(keys).toEqual([...Object.keys(envShape)].sort((a, b) => a.localeCompare(b)))
        expect(new Set(keys).size).toBe(keys.length)
        expect(keys).toContain('MAIL_HOSTNAME')
        expect(keys).toContain('SEND_REQUIRE_VALID_DNS')
        expect(keys).toHaveLength(43)
    })
})
