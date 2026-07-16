import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { IsFQDN, IsIP, IsNotEmpty, IsOptional, IsString } from 'class-validator'
import { IsIcann } from '../../domain/validators/IsIcann'

export class SendingDomainConfigureDto {
    @Expose()
    @IsString()
    @IsNotEmpty()
    @IsFQDN()
    @IsIcann()
    fqdn!: string

    @Expose()
    @IsIP('4')
    serverIpv4!: string

    @Expose()
    @IsOptional()
    @IsIP('6')
    @ApiProperty({ type: String, required: false })
    serverIpv6?: string
}
