import { Expose } from 'class-transformer'
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export class InboundFormCreateDto {
    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name!: string

    @Expose()
    @IsString()
    @Matches(SLUG_PATTERN)
    @MaxLength(255)
    slug!: string

    @Expose()
    @ApiProperty({ type: Number, nullable: true, required: false })
    @IsOptional()
    @IsInt()
    domainId: number | null = null
}

export class InboundFormUpdateDto {
    @Expose()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name?: string

    @Expose()
    @IsOptional()
    @IsString()
    @Matches(SLUG_PATTERN)
    @MaxLength(255)
    slug?: string

    @Expose()
    @ApiProperty({ type: Number, nullable: true, required: false })
    @IsOptional()
    @IsInt()
    domainId?: number | null

    @Expose()
    @ApiProperty({ type: Boolean, required: false })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}
