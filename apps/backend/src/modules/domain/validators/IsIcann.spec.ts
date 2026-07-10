import 'reflect-metadata'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { IsIcann } from './IsIcann'

class DomainProbe {
    @IsIcann()
    fqdn!: string
}

const probeWith = (fqdn: string): DomainProbe => {
    const probe = new DomainProbe()
    probe.fqdn = fqdn
    return probe
}

describe('IsIcann', () => {
    it('accepts a domain under a real ICANN TLD', async () => {
        const errors = await validate(probeWith('example.com'))

        expect(errors).toHaveLength(0)
    })

    it('rejects a domain under an unknown TLD and reports the default message', async () => {
        const errors = await validate(probeWith('example.invalidtld'))

        expect(errors).toHaveLength(1)
        expect(errors[0]?.constraints?.isIcann).toBe('The domain must be a valid ICANN domain.')
    })
})
