import { Queue } from 'bullmq'
import { INBOUND_FORM_DELIVERY_QUEUE } from '../../src/modules/inbound-form/inbound-form.constants.js'

// Delivery jobs live in the Redis every e2e file shares, so a delayed retry left
// by one file would otherwise run against the next file's app and database.
const queue = new Queue(INBOUND_FORM_DELIVERY_QUEUE, {
    connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) },
})
await queue.obliterate({ force: true })
await queue.close()
