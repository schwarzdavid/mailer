export function safeRedirect(target: unknown): string | undefined {
    if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') || target.includes('\\')) {
        return undefined
    }
    return target
}
