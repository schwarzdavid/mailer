import { normalizeHostname } from './hostname.js'

function hostnameOf(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null
    }
    try {
        return normalizeHostname(new URL(value).hostname)
    } catch {
        return null
    }
}

export function requestHostname(headers: Record<string, unknown>): string | null {
    const origin = headers['origin']
    return origin === undefined ? hostnameOf(headers['referer']) : hostnameOf(origin)
}

export function isOriginAllowed(allowedHostnames: string[], headers: Record<string, unknown>): boolean {
    if (allowedHostnames.length === 0) {
        return true
    }
    const hostname = requestHostname(headers)
    return hostname !== null && allowedHostnames.includes(hostname)
}
