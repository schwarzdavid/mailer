function errorDetails(error: Error): string[] {
    const details: string[] = []
    if ('code' in error && (typeof error.code === 'string' || typeof error.code === 'number')) {
        details.push(`code ${error.code}`)
    }
    if ('responseCode' in error && typeof error.responseCode === 'number') {
        details.push(`responseCode ${error.responseCode}`)
    }
    return details
}

export function describeError(error: unknown): string {
    if (!(error instanceof Error)) {
        return typeof error
    }

    const details = errorDetails(error)
    const description = details.length > 0 ? `${error.name} (${details.join(', ')})` : error.name

    return error.cause instanceof Error ? `${description} caused by ${describeError(error.cause)}` : description
}
