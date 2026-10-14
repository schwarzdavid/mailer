import { describe, expect, it } from 'vitest'
import { findPatternProblem, MAX_PATTERN_LENGTH } from './pattern-safety.js'

describe('findPatternProblem', () => {
    it.each([
        '^[A-Z]{2}\\d{4}$',
        '^\\+?[0-9 ]{6,20}$',
        '^[\\w.+-]+@[\\w-]+\\.[a-z]{2,}$',
        '^(foo|bar)$',
        '^(\\d{3})-(\\d{4})$',
        '^(?:ab)+$',
        '^(\\d{3}-)*\\d{4}$',
        '^(https?://)?example\\.com$',
        '^[(+)*]+$',
        '^a{2}$',
        '^(?<area>\\d{3})$',
    ])('accepts the safe pattern %s', (pattern) => {
        expect(findPatternProblem(pattern)).toBeNull()
    })

    it.each([
        ['(a+)+$', 'repetition'],
        ['^(a*)*$', 'repetition'],
        ['^(\\w+\\s?)*$', 'repetition'],
        ['^(a|aa)+$', 'alternation'],
        ['^(a|b)*c$', 'alternation'],
        ['^((ab)*c)+$', 'repetition'],
        ['^(x\\d{1,3})+$', 'repetition'],
        ['^(a+){2,}$', 'repetition'],
        ['^(?:a+)+$', 'repetition'],
        ['^((a|b)c)+$', 'alternation'],
    ])('rejects the backtracking-prone pattern %s', (pattern, reason) => {
        expect(findPatternProblem(pattern)).toContain(reason)
    })

    it('rejects backreferences', () => {
        expect(findPatternProblem('^(a)\\1$')).toBe('must not use backreferences')
        expect(findPatternProblem('^(?<x>a)\\k<x>$')).toBe('must not use backreferences')
    })

    it('rejects an invalid regular expression', () => {
        expect(findPatternProblem('[')).toBe('is not a valid regular expression')
    })

    it('rejects patterns longer than the limit', () => {
        expect(findPatternProblem('a'.repeat(MAX_PATTERN_LENGTH))).toBeNull()
        expect(findPatternProblem('a'.repeat(MAX_PATTERN_LENGTH + 1))).toContain(String(MAX_PATTERN_LENGTH))
    })

    it('treats an escaped backslash followed by a digit as a literal, not a backreference', () => {
        expect(findPatternProblem('^\\\\1$')).toBeNull()
    })
})
