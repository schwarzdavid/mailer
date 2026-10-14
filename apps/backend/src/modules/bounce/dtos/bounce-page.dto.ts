import { ApiProperty } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { BouncePage } from '../interfaces/bounce.interface.js'
import { BounceDto } from './bounce.dto.js'

export class BouncePageDto {
    @Expose()
    @Type(() => BounceDto)
    @ApiProperty({ type: [BounceDto] })
    items!: BounceDto[]

    @Expose()
    @ApiProperty({ type: Number })
    total!: number

    static fromBouncePage(page: BouncePage): BouncePageDto {
        return {
            items: page.items.map((bounce) => BounceDto.fromBounce(bounce)),
            total: page.total,
        }
    }
}
