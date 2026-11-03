import type { HealthCheckResult } from '@nestjs/terminus'

interface CachedRun {
    result: Promise<HealthCheckResult>
    expiresAt: number
}

export class CachedHealthCheck {
    private current: CachedRun | undefined

    constructor(
        private readonly run: () => Promise<HealthCheckResult>,
        private readonly cacheMs: number,
    ) {}

    check(): Promise<HealthCheckResult> {
        if (this.current && Date.now() < this.current.expiresAt) {
            return this.current.result
        }

        const current: CachedRun = { result: this.run(), expiresAt: Infinity }
        const expire = () => {
            current.expiresAt = Date.now() + this.cacheMs
        }
        void current.result.then(expire, expire)
        this.current = current
        return current.result
    }
}
