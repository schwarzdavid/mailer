import type { ApiKey, ApiKeyRecord } from '../interfaces/api-key.interface.js'

export function toApiKey({
    apiKeyId,
    projectId,
    name,
    prefix,
    createdByUserId,
    lastUsedAt,
    revokedAt,
    createdAt,
    updatedAt,
}: ApiKeyRecord): ApiKey {
    return { apiKeyId, projectId, name, prefix, createdByUserId, lastUsedAt, revokedAt, createdAt, updatedAt }
}
