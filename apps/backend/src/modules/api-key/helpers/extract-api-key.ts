import type { ExecutionContext } from '@nestjs/common'
import { hashApiKey, parseApiKeyPrefix } from './api-key-format.js'
import { API_KEY_AUTH_KEY } from '../api-key.constants.js'
import type { ApiKey } from '../interfaces/api-key.interface.js'

export interface ApiKeyRequest {
    headers: { authorization?: string }
    query: Record<string, unknown>
    ip?: string
    apiKey?: ApiKey
}

const BEARER = 'Bearer '

export function extractApiKey(request: Partial<ApiKeyRequest>): string | null {
    const authorization = request.headers?.authorization
    if (authorization?.startsWith(BEARER)) {
        return authorization.slice(BEARER.length).trim()
    }

    const key = request.query?.key
    return typeof key === 'string' ? key : null
}

export function publicApiThrottleTracker(request: Partial<ApiKeyRequest>): string {
    const rawKey = extractApiKey(request)
    return rawKey && parseApiKeyPrefix(rawKey)
        ? `api-key:${hashApiKey(rawKey)}`
        : `api-key-ip:${request.ip ?? 'unknown'}`
}

export function isApiKeyRoute(context: ExecutionContext): boolean {
    return [context.getHandler(), context.getClass()].some(
        (target) => Reflect.getMetadata(API_KEY_AUTH_KEY, target) === true,
    )
}
