import { describe, expect, it } from 'vitest'
import { apiErrorMessage } from '../apiErrorMessage.ts'

describe('apiErrorMessage', () => {
    it('returns the message of an API error body', () => {
        expect(apiErrorMessage({ message: 'Email already taken', statusCode: 409 }, 'fallback')).toBe(
            'Email already taken',
        )
    })

    it('returns the message of a thrown Error', () => {
        expect(apiErrorMessage(new Error('Network down'), 'fallback')).toBe('Network down')
    })

    it.each([
        ['null', null],
        ['undefined', undefined],
        ['a string', 'Bad Request'],
        ['an object without message', { statusCode: 500 }],
        ['an array message', { message: ['firstName should not be empty'] }],
        ['a numeric message', { message: 42 }],
    ])('falls back for %s', (_, error) => {
        expect(apiErrorMessage(error, 'Something went wrong')).toBe('Something went wrong')
    })
})
