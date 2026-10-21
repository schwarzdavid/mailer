import { createClient } from '@redis/client'
import { inject } from 'vitest'
import { THROTTLER_KEY_PREFIX } from '../../src/modules/throttler-storage/throttler-storage.constants.js'

export async function resetThrottleCounters(): Promise<void> {
    const env = inject('e2eEnv')
    const client = createClient({ url: `redis://${env.REDIS_HOST}:${env.REDIS_PORT}/0` })
    await client.connect()
    for await (const keys of client.scanIterator({ MATCH: `${THROTTLER_KEY_PREFIX}*`, COUNT: 100 })) {
        if (keys.length > 0) {
            await client.del(keys)
        }
    }
    await client.close()
}
