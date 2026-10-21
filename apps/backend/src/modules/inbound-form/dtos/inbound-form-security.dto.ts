import { Expose, Type } from 'class-transformer'
import {
    IsArray,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import {
    InboundFormSecurity,
    InboundFormSecurityConfigInput,
    InboundFormSecurityLocation,
    InboundFormSecurityStoredConfig,
    InboundFormSecurityType,
} from '../interfaces/inbound-form-security.interface.js'
import { isRecaptchaConfig, isTimedTokenConfig } from '../helpers/security-config.js'

export class InboundFormSecurityConfigUpsertDto implements InboundFormSecurityConfigInput {
    @Expose()
    @ApiProperty({
        type: String,
        required: false,
        description: 'Write-only. Omit to keep the secret already stored for this form.',
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    secret?: string

    @Expose()
    @ApiProperty({ type: Number, required: false, minimum: 0, maximum: 1 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    minScore?: number

    @Expose()
    @ApiProperty({ type: String, required: false, maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    expectedAction?: string

    @Expose()
    @ApiProperty({ type: Number, required: false, minimum: 1, maximum: 60 })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(60)
    minDelaySeconds?: number

    @Expose()
    @ApiProperty({ type: Number, required: false, minimum: 60, maximum: 86400 })
    @IsOptional()
    @IsInt()
    @Min(60)
    @Max(86400)
    maxAgeSeconds?: number
}

export class InboundFormSecurityConfigDto {
    @Expose()
    @ApiProperty({ type: Boolean, required: false })
    hasSecret?: boolean

    @Expose()
    @ApiProperty({ type: Number, required: false, minimum: 0, maximum: 1 })
    minScore?: number

    @Expose()
    @ApiProperty({ type: String, required: false, maxLength: 100 })
    expectedAction?: string

    @Expose()
    @ApiProperty({ type: Number, required: false, minimum: 1, maximum: 60 })
    minDelaySeconds?: number

    @Expose()
    @ApiProperty({ type: Number, required: false, minimum: 60, maximum: 86400 })
    maxAgeSeconds?: number

    static fromConfig(
        type: InboundFormSecurityType,
        config: InboundFormSecurityStoredConfig | null,
    ): InboundFormSecurityConfigDto | null {
        if (type === InboundFormSecurityType.RECAPTCHA && isRecaptchaConfig(config)) {
            return {
                hasSecret: !!config.encryptedSecret,
                minScore: config.minScore,
                expectedAction: config.expectedAction,
            }
        }

        if (type === InboundFormSecurityType.TIMED_TOKEN && isTimedTokenConfig(config)) {
            return { minDelaySeconds: config.minDelaySeconds, maxAgeSeconds: config.maxAgeSeconds }
        }

        return null
    }
}

export class InboundFormSecurityUpsertDto {
    @Expose()
    @ApiProperty({ enum: InboundFormSecurityType })
    @IsEnum(InboundFormSecurityType)
    type!: InboundFormSecurityType

    @Expose()
    @ApiProperty({ enum: InboundFormSecurityLocation })
    @IsEnum(InboundFormSecurityLocation)
    location!: InboundFormSecurityLocation

    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    key!: string

    @Expose()
    @IsOptional()
    @ValidateNested()
    @Type(() => InboundFormSecurityConfigUpsertDto)
    config: InboundFormSecurityConfigUpsertDto | null = null
}

export class InboundFormSecurityPutDto {
    @Expose()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InboundFormSecurityUpsertDto)
    security!: InboundFormSecurityUpsertDto[]
}

export class InboundFormSecurityDto {
    @Expose()
    inboundFormSecurityId!: number

    @Expose()
    @ApiProperty({ enum: InboundFormSecurityType })
    type!: InboundFormSecurityType

    @Expose()
    @ApiProperty({ enum: InboundFormSecurityLocation })
    location!: InboundFormSecurityLocation

    @Expose()
    key!: string

    @Expose()
    @Type(() => InboundFormSecurityConfigDto)
    config: InboundFormSecurityConfigDto | null = null

    static fromSecurity(security: InboundFormSecurity): InboundFormSecurityDto {
        return {
            inboundFormSecurityId: security.inboundFormSecurityId,
            type: security.type,
            location: security.location,
            key: security.key,
            config: InboundFormSecurityConfigDto.fromConfig(security.type, security.config),
        }
    }
}
