export const MAX_PATTERN_LENGTH = 200

interface GroupState {
    repeats: boolean
    alternates: boolean
}

const BOUNDED_QUANTIFIER = /^\{(\d+)(,(\d*))?\}/

export function findPatternProblem(pattern: string): string | null {
    if (pattern.length > MAX_PATTERN_LENGTH) {
        return `must not be longer than ${MAX_PATTERN_LENGTH} characters`
    }
    try {
        new RegExp(pattern)
    } catch {
        return 'is not a valid regular expression'
    }
    return findBacktrackingRisk(pattern)
}

function findBacktrackingRisk(pattern: string): string | null {
    const groups: GroupState[] = []
    let previousAtomIsAmbiguous = false
    let index = 0

    while (index < pattern.length) {
        const char = pattern[index]!

        if (char === '\\') {
            const escaped = pattern[index + 1] ?? ''
            if (/[1-9k]/.test(escaped)) {
                return 'must not use backreferences'
            }
            index += 2
            previousAtomIsAmbiguous = false
            continue
        }

        if (char === '[') {
            index = skipCharacterClass(pattern, index)
            previousAtomIsAmbiguous = false
            continue
        }

        if (char === '(') {
            groups.push({ repeats: false, alternates: false })
            index = skipGroupPrefix(pattern, index + 1)
            previousAtomIsAmbiguous = false
            continue
        }

        if (char === ')') {
            const closed = groups.pop() ?? { repeats: false, alternates: false }
            const parent = groups.at(-1)
            if (parent) {
                parent.repeats ||= closed.repeats
                parent.alternates ||= closed.alternates
            }
            previousAtomIsAmbiguous = closed.repeats || closed.alternates
            index += 1
            continue
        }

        if (char === '|') {
            const current = groups.at(-1)
            if (current) {
                current.alternates = true
            }
            previousAtomIsAmbiguous = false
            index += 1
            continue
        }

        const quantifier = readQuantifier(pattern, index)
        if (quantifier) {
            if (quantifier.repeats) {
                if (previousAtomIsAmbiguous) {
                    return 'must not repeat a group that itself contains a repetition or an alternation'
                }
                const current = groups.at(-1)
                if (current) {
                    current.repeats = true
                }
            }
            index += quantifier.length
            if (pattern[index] === '?') {
                index += 1
            }
            previousAtomIsAmbiguous = false
            continue
        }

        previousAtomIsAmbiguous = false
        index += 1
    }

    return null
}

function readQuantifier(pattern: string, index: number): { length: number; repeats: boolean } | null {
    const char = pattern[index]
    if (char === '*' || char === '+') {
        return { length: 1, repeats: true }
    }
    if (char === '?') {
        return { length: 1, repeats: false }
    }
    if (char !== '{') {
        return null
    }
    const match = BOUNDED_QUANTIFIER.exec(pattern.slice(index))
    if (!match) {
        return null
    }
    const min = Number(match[1])
    const max = match[2] === undefined ? min : match[3] === '' ? Infinity : Number(match[3])
    return { length: match[0].length, repeats: max > 1 && max !== min }
}

function skipCharacterClass(pattern: string, start: number): number {
    let index = start + 1
    while (index < pattern.length && pattern[index] !== ']') {
        index += pattern[index] === '\\' ? 2 : 1
    }
    return index + 1
}

function skipGroupPrefix(pattern: string, start: number): number {
    if (pattern[start] !== '?') {
        return start
    }
    const named = /^\?<(?![=!])[^>]*>/.exec(pattern.slice(start))
    if (named) {
        return start + named[0].length
    }
    const lookaround = /^\?(?:<[=!]|[:=!])/.exec(pattern.slice(start))
    return lookaround ? start + lookaround[0].length : start
}
