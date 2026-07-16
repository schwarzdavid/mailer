export function apiErrorMessage(error: unknown, fallback: string): string {
    if (error && typeof error === 'object' && 'message' in error) {
        const message = error.message
        if (typeof message === 'string') {
            return message
        }
    }
    return fallback
}
