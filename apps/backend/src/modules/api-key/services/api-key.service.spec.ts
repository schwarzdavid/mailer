import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common'
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager'
import { getModelToken } from '@nestjs/sequelize'
import { Test } from '@nestjs/testing'
import { createMongoAbility } from '@casl/ability'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ApiKeyService } from './api-key.service.js'
import { ApiKeyModel } from '../models/api-key.model.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { ApiKeyCreate, ApiKeyRecord } from '../interfaces/api-key.interface.js'
import { generateApiKey } from '../helpers/api-key-format.js'
import { AppAbility } from '../../permission/interfaces/app-ability.js'
import { User } from '../../user/interfaces/user.interface.js'
import { API_KEY_LAST_USED_CACHE_PREFIX, API_KEY_LAST_USED_INTERVAL_MS } from '../api-key.constants.js'

type ApiKeyRow = ApiKeyRecord & {
    get(options: { plain: true }): ApiKeyRecord
    update: Mock<(values: Partial<ApiKeyRecord>) => Promise<unknown>>
}

const updater = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [3] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [3] } } },
])
const reader = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [3] } } },
])
const outsider = createMongoAbility<AppAbility>([])

const principal: User = {
    userId: 7,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    roleId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
}

function rowFor(record: ApiKeyRecord): ApiKeyRow {
    return {
        ...record,
        get: () => record,
        update: vi.fn<ApiKeyRow['update']>().mockResolvedValue(null),
    }
}

describe('ApiKeyService', () => {
    let service: ApiKeyService
    let create: Mock<(values: ApiKeyCreate) => Promise<ApiKeyRow>>
    let findAll: Mock<(options: object) => Promise<ApiKeyRow[]>>
    let findOne: Mock<(options: object) => Promise<ApiKeyRow | null>>
    let update: Mock<(values: Partial<ApiKeyRecord>, options: object) => Promise<[number]>>
    let cacheGet: Mock<Cache['get']>
    let cacheSet: Mock<Cache['set']>

    const generated = generateApiKey()
    const record: ApiKeyRecord = {
        apiKeyId: 11,
        projectId: 3,
        name: 'Newsletter',
        prefix: generated.prefix,
        secretHash: generated.secretHash,
        createdByUserId: 7,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
        create = vi
            .fn<typeof create>()
            .mockImplementation((values) => Promise.resolve(rowFor({ ...record, ...values, apiKeyId: 12 })))
        findAll = vi.fn<typeof findAll>().mockResolvedValue([rowFor(record)])
        findOne = vi.fn<typeof findOne>().mockResolvedValue(rowFor(record))
        update = vi.fn<typeof update>().mockResolvedValue([1])
        cacheGet = vi.fn<Cache['get']>().mockResolvedValue(undefined)
        cacheSet = vi.fn<Cache['set']>().mockResolvedValue(true)

        const module = await Test.createTestingModule({
            providers: [
                ApiKeyService,
                { provide: getModelToken(ApiKeyModel), useValue: { create, findAll, findOne, update } },
                { provide: CACHE_MANAGER, useValue: { get: cacheGet, set: cacheSet } },
            ],
        }).compile()
        service = module.get(ApiKeyService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('createKey', () => {
        it('stores only the prefix and hash and returns the full key once', async () => {
            const { apiKey, key } = await service.createKey(3, 'Newsletter', principal, updater)

            const stored = create.mock.calls[0]![0]
            expect(stored).toEqual({
                projectId: 3,
                name: 'Newsletter',
                prefix: expect.stringMatching(/^sdm_[0-9A-Za-z]{8}$/) as string,
                secretHash: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
                createdByUserId: 7,
            })
            expect(key.startsWith(`${stored.prefix}_`)).toBe(true)
            expect(apiKey).not.toHaveProperty('secretHash')
            expect(apiKey.apiKeyId).toBe(12)
        })

        it('requires the project update permission', async () => {
            await expect(service.createKey(3, 'x', principal, reader)).rejects.toThrow(ForbiddenException)
            await expect(service.createKey(3, 'x', principal, outsider)).rejects.toThrow(NotFoundException)
            expect(create).not.toHaveBeenCalled()
        })
    })

    describe('listKeys', () => {
        it('lists the project keys without hashes for readers', async () => {
            const keys = await service.listKeys(3, reader)

            expect(findAll).toHaveBeenCalledWith({ where: { projectId: 3 }, order: [['apiKeyId', 'DESC']] })
            expect(keys).toHaveLength(1)
            expect(keys[0]).not.toHaveProperty('secretHash')
        })

        it('hides projects the caller cannot read', async () => {
            await expect(service.listKeys(3, outsider)).rejects.toThrow(NotFoundException)
        })
    })

    describe('revokeKey', () => {
        it('sets revokedAt on an active key of the project', async () => {
            const row = rowFor(record)
            findOne.mockResolvedValue(row)

            await service.revokeKey(3, 11, updater)

            expect(findOne).toHaveBeenCalledWith({ where: { apiKeyId: 11, projectId: 3 } })
            expect(row.update).toHaveBeenCalledWith({ revokedAt: expect.any(Date) as Date })
        })

        it('is idempotent for an already revoked key', async () => {
            const row = rowFor({ ...record, revokedAt: new Date() })
            findOne.mockResolvedValue(row)

            await service.revokeKey(3, 11, updater)

            expect(row.update).not.toHaveBeenCalled()
        })

        it('404s for a key of another project', async () => {
            findOne.mockResolvedValue(null)

            await expect(service.revokeKey(3, 99, updater)).rejects.toThrow(NotFoundException)
        })

        it('requires the project update permission', async () => {
            await expect(service.revokeKey(3, 11, reader)).rejects.toThrow(ForbiddenException)
        })
    })

    describe('authenticate', () => {
        it('returns the key for a valid secret, looked up by prefix on a live project', async () => {
            const apiKey = await service.authenticate(generated.key)

            expect(findOne).toHaveBeenCalledWith({
                where: { prefix: generated.prefix, revokedAt: null },
                include: [{ model: ProjectModel, required: true, attributes: [] }],
            })
            expect(apiKey).toEqual(expect.objectContaining({ apiKeyId: 11, projectId: 3 }))
            expect(apiKey).not.toHaveProperty('secretHash')
        })

        it('rejects a wrong secret for a known prefix', async () => {
            const forged = `${generated.prefix}_${'A'.repeat(43)}`

            await expect(service.authenticate(forged)).resolves.toBeNull()
        })

        it('rejects a malformed key without querying', async () => {
            await expect(service.authenticate('not-a-key')).resolves.toBeNull()
            expect(findOne).not.toHaveBeenCalled()
        })

        it('rejects unknown, revoked or trashed-project keys', async () => {
            findOne.mockResolvedValue(null)

            await expect(service.authenticate(generated.key)).resolves.toBeNull()
        })
    })

    describe('touchLastUsed', () => {
        it('writes lastUsedAt and remembers the write for the interval', async () => {
            await service.touchLastUsed(11)

            expect(update).toHaveBeenCalledWith({ lastUsedAt: expect.any(Date) as Date }, { where: { apiKeyId: 11 } })
            expect(cacheSet).toHaveBeenCalledWith(
                `${API_KEY_LAST_USED_CACHE_PREFIX}11`,
                true,
                API_KEY_LAST_USED_INTERVAL_MS,
            )
        })

        it('skips the write while a recent one is remembered', async () => {
            cacheGet.mockResolvedValue(true)

            await service.touchLastUsed(11)

            expect(update).not.toHaveBeenCalled()
        })

        it('logs instead of throwing when the write fails', async () => {
            update.mockRejectedValue(new Error('db down'))

            await expect(service.touchLastUsed(11)).resolves.toBeUndefined()
        })
    })
})
