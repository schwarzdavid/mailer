export const LOGIN_THROTTLE_LIMIT = 10

export const LOGIN_THROTTLE_TTL_MS = 60_000

export const LOGIN_THROTTLE_BLOCK_MS = 5 * 60_000

export function loginThrottleTracker(request: { ip?: string; body?: unknown }): string {
    const body = request.body
    const email =
        typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string'
            ? body.email.trim().toLowerCase()
            : ''

    return `${request.ip ?? 'unknown'}|${email}`
}
