import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler'
import { ThrottlerStorageUnavailableError } from '../exceptions/throttler-storage-unavailable.error.js'
import { THROTTLE_FAIL_CLOSED_KEY } from '../throttler-storage.constants.js'

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
    private readonly appLogger = new Logger(AppThrottlerGuard.name)

    protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
        try {
            return await super.handleRequest(requestProps)
        } catch (error) {
            if (!(error instanceof ThrottlerStorageUnavailableError)) {
                throw error
            }

            const { context } = requestProps
            const failsClosed = this.reflector.getAllAndOverride<boolean | undefined>(THROTTLE_FAIL_CLOSED_KEY, [
                context.getHandler(),
                context.getClass(),
            ])
            if (failsClosed) {
                throw new ServiceUnavailableException('Rate limiting is temporarily unavailable')
            }

            this.appLogger.warn(`Rate limit not enforced, ${error.message}`)
            return true
        }
    }
}
