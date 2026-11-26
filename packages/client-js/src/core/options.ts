export interface ClientOptions {
    baseUrl: string
    fetch?: typeof fetch
    timeoutMs?: number
}

export const DEFAULT_TIMEOUT_MS = 30_000

export function resolveApiBase(baseUrl: string): string {
    let protocol: string
    let hasSearchOrHash: boolean
    try {
        const url = new URL(baseUrl)
        protocol = url.protocol
        hasSearchOrHash = /[?#]/.test(baseUrl)
    } catch {
        throw new TypeError('baseUrl must be an absolute http(s) URL')
    }
    if ((protocol !== 'http:' && protocol !== 'https:') || hasSearchOrHash) {
        throw new TypeError('baseUrl must be an absolute http(s) URL')
    }
    return `${baseUrl.replace(/\/+$/, '')}/api/v1`
}
