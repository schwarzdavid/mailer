import { createClient } from '@redis/client'
import { inject } from 'vitest'
import { THROTTLER_KEY_PREFIX } from '../../src/modules/throttler-storage/throttler-storage.constants.js'

// Throttle counters live in the Redis every e2e file shares and outlive the app
// that wrote them, so each file starts from an empty budget as it would with
// per-process storage. Files run sequentially, so no running file is affected.
const env = inject('e2eEnv')
const client = createClient({ url: `redis://${env.REDIS_HOST}:${env.REDIS_PORT}/0` })
await client.connect()
for await (const keys of client.scanIterator({ MATCH: `${THROTTLER_KEY_PREFIX}*`, COUNT: 100 })) {
    if (keys.length > 0) {
        await client.del(keys)
    }
}
await client.close()
