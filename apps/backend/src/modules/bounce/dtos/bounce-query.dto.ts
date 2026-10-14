import { ApiProperty } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { BounceType } from '../interfaces/bounce.interface.js'
import type { BounceSortField, SortOrder } from '../interfaces/bounce.interface.js'
import { BOUNCE_PAGE_SIZE_DEFAULT, BOUNCE_PAGE_SIZE_MAX, BOUNCE_SORT_FIELDS, SORT_ORDERS } from '../bounce.constants.js'

export class BounceQueryDto {
    @Expose()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @ApiProperty({ type: Number, required: false, default: 1, minimum: 1 })
    page: number = 1

    @Expose()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(BOUNCE_PAGE_SIZE_MAX)
    @ApiProperty({
        type: Number,
        required: false,
        default: BOUNCE_PAGE_SIZE_DEFAULT,
        minimum: 1,
        maximum: BOUNCE_PAGE_SIZE_MAX,
    })
    itemsPerPage: number = BOUNCE_PAGE_SIZE_DEFAULT

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    @ApiProperty({ type: String, required: false })
    search?: string

    @Expose()
    @IsOptional()
    @IsEnum(BounceType)
    @ApiProperty({ enum: BounceType, required: false })
    type?: BounceType

    @Expose()
    @IsOptional()
    @IsISO8601({ strict: true })
    @ApiProperty({ type: String, format: 'date-time', required: false })
    receivedAfter?: string

    @Expose()
    @IsOptional()
    @IsIn(BOUNCE_SORT_FIELDS)
    @ApiProperty({ enum: BOUNCE_SORT_FIELDS, required: false, default: 'receivedAt' })
    sortBy: BounceSortField = 'receivedAt'

    @Expose()
    @IsOptional()
    @IsIn(SORT_ORDERS)
    @ApiProperty({ enum: SORT_ORDERS, required: false, default: 'desc' })
    sortOrder: SortOrder = 'desc'
}
