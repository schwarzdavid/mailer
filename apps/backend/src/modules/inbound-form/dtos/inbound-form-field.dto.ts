import { Expose, Type } from 'class-transformer'
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import {
    InboundFormField,
    InboundFormFieldType,
    InboundFormFieldValidation,
} from '../interfaces/inbound-form-field.interface'

export class InboundFormFieldValidationDto implements InboundFormFieldValidation {
    @Expose()
    @ApiProperty({ type: Boolean, required: false })
    @IsOptional()
    @IsBoolean()
    required?: boolean

    @Expose()
    @IsOptional()
    @IsInt()
    @Min(0)
    minLength?: number

    @Expose()
    @IsOptional()
    @IsInt()
    @Min(0)
    maxLength?: number

    @Expose()
    @IsOptional()
    @IsString()
    pattern?: string

    @Expose()
    @IsOptional()
    @IsNumber()
    min?: number

    @Expose()
    @IsOptional()
    @IsNumber()
    max?: number
}

export class InboundFormFieldUpsertDto {
    @Expose()
    @IsString()
    @Matches(/^[\w-]+$/)
    @MaxLength(255)
    key!: string

    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    label!: string

    @Expose()
    @ApiProperty({ enum: InboundFormFieldType })
    @IsEnum(InboundFormFieldType)
    type!: InboundFormFieldType

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    defaultValue: string | null = null

    @Expose()
    @IsOptional()
    @ValidateNested()
    @Type(() => InboundFormFieldValidationDto)
    validation: InboundFormFieldValidationDto | null = null
}

export class InboundFormFieldsPutDto {
    @Expose()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => InboundFormFieldUpsertDto)
    fields!: InboundFormFieldUpsertDto[]
}

export class InboundFormFieldDto {
    @Expose()
    inboundFormFieldId!: number

    @Expose()
    key!: string

    @Expose()
    label!: string

    @Expose()
    @ApiProperty({ enum: InboundFormFieldType })
    type!: InboundFormFieldType

    @Expose()
    defaultValue: string | null = null

    @Expose()
    @Type(() => InboundFormFieldValidationDto)
    validation: InboundFormFieldValidationDto | null = null

    static fromField(field: InboundFormField): InboundFormFieldDto {
        return {
            inboundFormFieldId: field.inboundFormFieldId,
            key: field.key,
            label: field.label,
            type: field.type,
            defaultValue: field.defaultValue,
            validation: field.validation,
        }
    }
}
