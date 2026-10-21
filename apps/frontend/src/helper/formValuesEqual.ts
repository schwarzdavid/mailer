function canonical(value: unknown): unknown {
    if (value === null || value === undefined || value === '') {
        return undefined
    }
    if (typeof value === 'number') {
        return String(value)
    }
    if (Array.isArray(value)) {
        return value.length === 0 ? undefined : value.map((item) => canonical(item) ?? null)
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value)
            .map(([key, item]) => [key, canonical(item)] as const)
            .filter(([, item]) => item !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
        return entries.length === 0 ? undefined : Object.fromEntries(entries)
    }
    return value
}

export function formValuesEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}
