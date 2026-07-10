import { Expose } from 'class-transformer'
import { IsObject, IsOptional } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class InboundFormSubmitDto {
    @Expose()
    @ApiProperty({ type: 'object', additionalProperties: true })
    @IsOptional()
    @IsObject()
    security?: Record<string, unknown>

    @Expose()
    @ApiProperty({ type: 'object', additionalProperties: true })
    @IsObject()
    data!: Record<string, unknown>
}

export class InboundFormSubmitResultDto {
    @Expose()
    @ApiProperty({ enum: ['accepted'] })
    status!: 'accepted'
}
