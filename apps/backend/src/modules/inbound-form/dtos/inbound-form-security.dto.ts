import { Expose, Type } from 'class-transformer'
import {
    IsArray,
    IsEnum,
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
    InboundFormRecaptchaConfigInput,
    InboundFormRecaptchaStoredConfig,
    InboundFormSecurity,
    InboundFormSecurityLocation,
    InboundFormSecurityType,
} from '../interfaces/inbound-form-security.interface.js'

export class InboundFormRecaptchaConfigUpsertDto implements InboundFormRecaptchaConfigInput {
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
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    minScore?: number
}

export class InboundFormRecaptchaConfigDto {
    @Expose()
    @ApiProperty({ type: Boolean })
    hasSecret!: boolean

    @Expose()
    @ApiProperty({ type: Number, required: false, minimum: 0, maximum: 1 })
    minScore?: number

    static fromConfig(config: InboundFormRecaptchaStoredConfig | null): InboundFormRecaptchaConfigDto | null {
        if (!config) {
            return null
        }

        return { hasSecret: !!config.encryptedSecret, minScore: config.minScore }
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
    @Type(() => InboundFormRecaptchaConfigUpsertDto)
    config: InboundFormRecaptchaConfigUpsertDto | null = null
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
    @Type(() => InboundFormRecaptchaConfigDto)
    config: InboundFormRecaptchaConfigDto | null = null

    static fromSecurity(security: InboundFormSecurity): InboundFormSecurityDto {
        return {
            inboundFormSecurityId: security.inboundFormSecurityId,
            type: security.type,
            location: security.location,
            key: security.key,
            config: InboundFormRecaptchaConfigDto.fromConfig(security.config),
        }
    }
}
