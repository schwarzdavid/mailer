import { describe, expect, it, vi, type Mock } from 'vitest'
import { InboundFormClientScript, loadInboundFormClientScript } from './inbound-form-client-script.js'

describe('loadInboundFormClientScript', () => {
    it('returns the bundled script', () => {
        expect(loadInboundFormClientScript()).toContain('InboundForm')
    })

    it('propagates a resolve failure', () => {
        const resolve: Mock<(id: string) => string> = vi.fn<(id: string) => string>().mockImplementation(() => {
            throw new Error('cannot resolve')
        })

        expect(() => loadInboundFormClientScript(resolve)).toThrow('cannot resolve')
    })
})

describe('InboundFormClientScript', () => {
    it('exposes the bundled script as its source', () => {
        expect(new InboundFormClientScript().source).toBe(loadInboundFormClientScript())
    })
})
