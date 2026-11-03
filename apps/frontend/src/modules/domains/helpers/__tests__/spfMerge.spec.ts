import { describe, expect, it } from 'vitest'
import { suggestSpfMerge } from '../spfMerge.ts'

describe('suggestSpfMerge', () => {
    it('inserts the missing include before the all term', () => {
        expect(suggestSpfMerge('v=spf1 include:mx.example.com ~all', 'v=spf1 ip4:192.0.2.1 -all')).toBe(
            'v=spf1 ip4:192.0.2.1 include:mx.example.com -all',
        )
    })

    it('appends the include and a soft-fail all term when the record has none', () => {
        expect(suggestSpfMerge('v=spf1 include:mx.example.com ~all', 'v=spf1 ip4:192.0.2.1')).toBe(
            'v=spf1 ip4:192.0.2.1 include:mx.example.com ~all',
        )
    })

    it('appends the include without an all term when the record redirects', () => {
        expect(
            suggestSpfMerge('v=spf1 include:mx.example.com ~all', 'v=spf1 ip4:192.0.2.1 redirect=_spf.example.org'),
        ).toBe('v=spf1 ip4:192.0.2.1 redirect=_spf.example.org include:mx.example.com')
    })

    it('returns null when nothing is missing', () => {
        expect(suggestSpfMerge('v=spf1 include:mx.example.com ~all', 'v=spf1 INCLUDE:mx.example.com -all')).toBeNull()
    })

    it('adds only the missing mechanisms', () => {
        expect(suggestSpfMerge('v=spf1 include:mx.example.com ip4:192.0.2.1 ~all', 'v=spf1 ip4:192.0.2.1 ?all')).toBe(
            'v=spf1 ip4:192.0.2.1 include:mx.example.com ?all',
        )
    })
})
