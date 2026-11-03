import type { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus'
import { describeError } from '../../../helpers/describe-error.js'

class ProbeTimeoutError extends Error {}

export async function probeWithin(
    session: ReturnType<HealthIndicatorService['check']>,
    probe: () => Promise<unknown>,
    timeoutMs: number,
): Promise<HealthIndicatorResult> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ProbeTimeoutError(`Timed out after ${timeoutMs} ms`)), timeoutMs)
    })

    try {
        await Promise.race([probe(), timeout])
        return session.up()
    } catch (error) {
        return session.down({ message: error instanceof ProbeTimeoutError ? error.message : describeError(error) })
    } finally {
        clearTimeout(timer)
    }
}
