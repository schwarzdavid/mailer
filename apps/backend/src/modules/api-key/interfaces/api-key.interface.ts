export interface ApiKey {
    apiKeyId: number
    projectId: number
    name: string
    prefix: string
    createdByUserId: number | null
    lastUsedAt: Date | null
    revokedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

export interface ApiKeyRecord extends ApiKey {
    secretHash: string
}

export type ApiKeyCreate = Pick<ApiKeyRecord, 'projectId' | 'name' | 'prefix' | 'secretHash' | 'createdByUserId'>
