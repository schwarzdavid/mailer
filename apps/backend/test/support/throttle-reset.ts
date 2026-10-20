import { resetThrottleCounters } from './throttle-counters.js'

// Throttle counters live in the Redis every e2e file shares and outlive the app
// that wrote them, so each file starts from an empty budget as it would with
// per-process storage. Files run sequentially, so no running file is affected.
await resetThrottleCounters()
