import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ApiKeyAuthGuard } from './api-key-auth.guard.js'
import { ApiKeyService } from '../services/api-key.service.js'
import { ApiKey } from '../interfaces/api-key.interface.js'
import { ApiKeyRequest } from '../helpers/extract-api-key.js'

const apiKey: ApiKey = {
    apiKeyId: 11,
    projectId: 3,
    name: 'Newsletter',
    prefix: 'sdm_abcdEFGH',
    createdByUserId: 7,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
}
const rawKey = `sdm_abcdEFGH_${'a'.repeat(43)}`

function contextFor(request: ApiKeyRequest): ExecutionContext {
    return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext
}

describe('ApiKeyAuthGuard', () => {
    let authenticate: Mock<ApiKeyService['authenticate']>
    let touchLastUsed: Mock<ApiKeyService['touchLastUsed']>
    let guard: ApiKeyAuthGuard

    beforeEach(() => {
        authenticate = vi.fn<ApiKeyService['authenticate']>().mockResolvedValue(apiKey)
        touchLastUsed = vi.fn<ApiKeyService['touchLastUsed']>().mockResolvedValue(undefined)
        guard = new ApiKeyAuthGuard({ authenticate, touchLastUsed } as unknown as ApiKeyService)
    })

    it('attaches the authenticated key and records its use', async () => {
        const request: ApiKeyRequest = { headers: { authorization: `Bearer ${rawKey}` }, query: {} }

        await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
        expect(authenticate).toHaveBeenCalledWith(rawKey)
        expect(request.apiKey).toEqual(apiKey)
        expect(touchLastUsed).toHaveBeenCalledWith(11)
    })

    it('accepts the key from the query string', async () => {
        await expect(guard.canActivate(contextFor({ headers: {}, query: { key: rawKey } }))).resolves.toBe(true)
    })

    it('rejects a request without a key', async () => {
        await expect(guard.canActivate(contextFor({ headers: {}, query: {} }))).rejects.toThrow(UnauthorizedException)
        expect(authenticate).not.toHaveBeenCalled()
    })

    it('rejects a key that does not authenticate', async () => {
        authenticate.mockResolvedValue(null)

        await expect(guard.canActivate(contextFor({ headers: {}, query: { key: rawKey } }))).rejects.toThrow(
            UnauthorizedException,
        )
    })
})
