import { describe, expect, it } from 'vitest'
import { pickDefined } from './pick-defined.js'

interface Sample {
    name?: string
    count?: number
    note?: string | null
    secret?: string
}

describe('pickDefined', () => {
    it('keeps only the allowed keys', () => {
        const source: Sample = { name: 'a', count: 1, secret: 'leak' }

        expect(pickDefined(source, ['name', 'count'])).toEqual({ name: 'a', count: 1 })
    })

    it('drops keys whose value is undefined', () => {
        const source: Sample = { name: undefined, count: 2 }

        const picked = pickDefined(source, ['name', 'count'])

        expect(picked).toEqual({ count: 2 })
        expect(Object.keys(picked)).toEqual(['count'])
    })

    it('keeps explicit nulls and falsy values', () => {
        const source: Sample = { note: null, count: 0, name: '' }

        expect(pickDefined(source, ['note', 'count', 'name'])).toEqual({ note: null, count: 0, name: '' })
    })
})
