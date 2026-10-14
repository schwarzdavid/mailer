import { describe, expect, it } from 'vitest'
import { formatAbsolute, formatDay, formatRelative, formatSmart, isWithinDay } from '../formatDate.ts'

const now = new Date(2026, 9, 14, 13, 45)

describe('formatDate', () => {
    it('formats absolute dates as day, short month, year and 24h time', () => {
        expect(formatAbsolute(now, 'en')).toBe('14 Oct 2026, 13:45')
    })

    it('accepts ISO strings', () => {
        expect(formatDay(new Date(2026, 10, 13).toISOString(), 'en')).toBe('13 Nov 2026')
    })

    it('formats recent times relative to now', () => {
        expect(formatRelative(new Date(now.getTime() - 3 * 60 * 1000), 'en', now)).toBe('3 min ago')
        expect(formatRelative(new Date(now.getTime() - 2 * 60 * 60 * 1000), 'en', now)).toBe('2 hr ago')
    })

    it('switches to the absolute date after 24 hours', () => {
        const older = new Date(2026, 9, 12, 9, 5)

        expect(isWithinDay(older, now)).toBe(false)
        expect(formatSmart(older, 'en', now)).toBe('12 Oct 2026, 09:05')
        expect(formatSmart(new Date(now.getTime() - 60 * 1000), 'en', now)).toBe('1 min ago')
    })
})
