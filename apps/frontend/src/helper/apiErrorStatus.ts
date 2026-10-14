export function apiErrorStatus(error: unknown): number | undefined {
    if (error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number') {
        return error.statusCode
    }
    return undefined
}
