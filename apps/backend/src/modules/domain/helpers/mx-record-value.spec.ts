import { describe, expect, it } from 'vitest'
import { formatMxRecordValue, parseMxRecordValue } from './mx-record-value.js'

describe('formatMxRecordValue', () => {
    it('joins priority and exchange the way DNS presents them', () => {
        expect(formatMxRecordValue({ priority: 10, exchange: 'mx.example.com' })).toBe('10 mx.example.com')
    })
})

describe('parseMxRecordValue', () => {
    it('splits priority and exchange', () => {
        expect(parseMxRecordValue('10 mx.example.com')).toEqual({ priority: 10, exchange: 'mx.example.com' })
    })

    it('reads back what formatMxRecordValue wrote', () => {
        const mx = { priority: 0, exchange: 'mail.example.org' }

        expect(parseMxRecordValue(formatMxRecordValue(mx))).toEqual(mx)
    })

    it.each(['mx.example.com', '10', 'ten mx.example.com', '10 mx.example.com extra', ''])('rejects %j', (value) => {
        expect(parseMxRecordValue(value)).toBeNull()
    })
})
