export class ThrottlerStorageUnavailableError extends Error {
    constructor(cause: unknown) {
        const causeMessage = cause instanceof Error ? cause.message : String(cause)
        super(`Redis throttler storage unavailable: ${causeMessage}`, { cause })
        this.name = ThrottlerStorageUnavailableError.name
    }
}
