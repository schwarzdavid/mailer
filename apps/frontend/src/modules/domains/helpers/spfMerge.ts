const ALL_TERM = /^[-~+?]?all$/i
const REDIRECT_MODIFIER = /^redirect=/i

function terms(record: string): string[] {
    return record.split(/\s+/).filter((term) => term !== '')
}

export function suggestSpfMerge(expected: string, current: string): string | null {
    const currentTerms = terms(current)
    const present = new Set(currentTerms.map((term) => term.toLowerCase()))
    const missing = terms(expected).filter(
        (term) => term.toLowerCase() !== 'v=spf1' && !ALL_TERM.test(term) && !present.has(term.toLowerCase()),
    )
    if (missing.length === 0) {
        return null
    }
    const allIndex = currentTerms.findIndex((term) => ALL_TERM.test(term))
    if (allIndex === -1) {
        const hasRedirect = currentTerms.some((term) => REDIRECT_MODIFIER.test(term))
        return [...currentTerms, ...missing, ...(hasRedirect ? [] : ['~all'])].join(' ')
    }
    return [...currentTerms.slice(0, allIndex), ...missing, ...currentTerms.slice(allIndex)].join(' ')
}
