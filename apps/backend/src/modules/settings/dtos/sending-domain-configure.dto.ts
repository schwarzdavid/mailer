import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { IsIP, IsOptional } from 'class-validator'

export class SendingDomainConfigureDto {
    @Expose()
    @IsIP('4')
    serverIpv4!: string

    @Expose()
    @IsOptional()
    @IsIP('6')
    @ApiProperty({ type: String, required: false })
    serverIpv6?: string
}
