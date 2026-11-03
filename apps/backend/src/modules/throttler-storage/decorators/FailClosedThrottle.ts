import { SetMetadata } from '@nestjs/common'
import { THROTTLE_FAIL_CLOSED_KEY } from '../throttler-storage.constants.js'

export const FailClosedThrottle = () => SetMetadata(THROTTLE_FAIL_CLOSED_KEY, true)
