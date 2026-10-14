import { describe, expect, it } from 'vitest'
import { apiErrorStatus } from '../apiErrorStatus.ts'

describe('apiErrorStatus', () => {
    it('returns the status code of an API error body', () => {
        expect(apiErrorStatus({ message: 'Unauthorized', statusCode: 401 })).toBe(401)
    })

    it.each([
        ['null', null],
        ['undefined', undefined],
        ['a thrown Error', new Error('Network down')],
        ['a string status code', { statusCode: '401' }],
        ['a string', 'Unauthorized'],
    ])('returns undefined for %s', (_, error) => {
        expect(apiErrorStatus(error)).toBeUndefined()
    })
})
