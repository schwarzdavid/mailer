const TRANSIENT_ERROR_CODES: ReadonlySet<string> = new Set([
    'ECONNECTION',
    'ETIMEDOUT',
    'ESOCKET',
    'EDNS',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETLS',
])

export function isTransientSmtpError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false
    }
    const responseCode = 'responseCode' in error ? error.responseCode : undefined
    if (typeof responseCode === 'number') {
        return responseCode >= 400 && responseCode < 500
    }
    const code = 'code' in error ? error.code : undefined
    return typeof code === 'string' && TRANSIENT_ERROR_CODES.has(code)
}
