import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { ApiKey } from '../interfaces/api-key.interface.js'

export class ApiKeyDto implements Omit<ApiKey, 'projectId' | 'updatedAt'> {
    @Expose()
    apiKeyId!: number

    @Expose()
    name!: string

    @Expose()
    prefix!: string

    @Expose()
    @ApiProperty({ type: Number, nullable: true })
    createdByUserId: number | null = null

    @Expose()
    @ApiProperty({ type: Date, nullable: true })
    lastUsedAt: Date | null = null

    @Expose()
    @ApiProperty({ type: Date, nullable: true })
    revokedAt: Date | null = null

    @Expose()
    createdAt!: Date

    static fromApiKey(apiKey: ApiKey): ApiKeyDto {
        return {
            apiKeyId: apiKey.apiKeyId,
            name: apiKey.name,
            prefix: apiKey.prefix,
            createdByUserId: apiKey.createdByUserId,
            lastUsedAt: apiKey.lastUsedAt,
            revokedAt: apiKey.revokedAt,
            createdAt: apiKey.createdAt,
        }
    }
}

export class ApiKeyCreatedDto extends ApiKeyDto {
    @Expose()
    key!: string

    static fromCreated(apiKey: ApiKey, key: string): ApiKeyCreatedDto {
        return { ...ApiKeyDto.fromApiKey(apiKey), key }
    }
}
