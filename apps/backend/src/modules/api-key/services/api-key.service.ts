import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager'
import { InjectModel } from '@nestjs/sequelize'
import { ApiKeyModel } from '../models/api-key.model.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { ApiKey } from '../interfaces/api-key.interface.js'
import { toApiKey } from '../mappers/api-key.mapper.js'
import { generateApiKey, matchesApiKeyHash, parseApiKeyPrefix } from '../helpers/api-key-format.js'
import { assertProjectPermission, assertProjectReadable } from '../../permission/helpers/project-access.js'
import { AppAbility } from '../../permission/interfaces/app-ability.js'
import { User } from '../../user/interfaces/user.interface.js'
import { API_KEY_LAST_USED_CACHE_PREFIX, API_KEY_LAST_USED_INTERVAL_MS } from '../api-key.constants.js'

export interface CreatedApiKey {
    apiKey: ApiKey
    key: string
}

@Injectable()
export class ApiKeyService {
    private readonly logger = new Logger(ApiKeyService.name)

    constructor(
        @InjectModel(ApiKeyModel) private readonly apiKeyModel: typeof ApiKeyModel,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    ) {}

    async createKey(projectId: number, name: string, principal: User, ability: AppAbility): Promise<CreatedApiKey> {
        assertProjectPermission(ability, 'api_keys.manage', projectId)

        const { key, prefix, secretHash } = generateApiKey()
        const row = await this.apiKeyModel.create({
            projectId,
            name,
            prefix,
            secretHash,
            createdByUserId: principal.userId,
        })

        return { apiKey: toApiKey(row.get({ plain: true })), key }
    }

    async listKeys(projectId: number, ability: AppAbility): Promise<ApiKey[]> {
        assertProjectReadable(ability, projectId)

        const rows = await this.apiKeyModel.findAll({ where: { projectId }, order: [['apiKeyId', 'DESC']] })

        return rows.map((row) => toApiKey(row.get({ plain: true })))
    }

    async revokeKey(projectId: number, apiKeyId: number, ability: AppAbility): Promise<void> {
        assertProjectPermission(ability, 'api_keys.manage', projectId)

        const row = await this.apiKeyModel.findOne({ where: { apiKeyId, projectId } })
        if (!row) {
            throw new NotFoundException('Unknown API key')
        }
        if (row.revokedAt) {
            return
        }

        await row.update({ revokedAt: new Date() })
    }

    async authenticate(rawKey: string): Promise<ApiKey | null> {
        const prefix = parseApiKeyPrefix(rawKey)
        if (!prefix) {
            return null
        }

        const row = await this.apiKeyModel.findOne({
            where: { prefix, revokedAt: null },
            include: [{ model: ProjectModel, required: true, attributes: [] }],
        })
        if (!row) {
            return null
        }

        const record = row.get({ plain: true })
        return matchesApiKeyHash(rawKey, record.secretHash) ? toApiKey(record) : null
    }

    async touchLastUsed(apiKeyId: number): Promise<void> {
        const cacheKey = `${API_KEY_LAST_USED_CACHE_PREFIX}${apiKeyId}`
        try {
            if (await this.cacheManager.get(cacheKey)) {
                return
            }
            await this.apiKeyModel.update({ lastUsedAt: new Date() }, { where: { apiKeyId } })
            await this.cacheManager.set(cacheKey, true, API_KEY_LAST_USED_INTERVAL_MS)
        } catch (error) {
            this.logger.error(
                `Failed to record usage of API key ${apiKeyId}: ${error instanceof Error ? error.message : String(error)}`,
            )
        }
    }
}
