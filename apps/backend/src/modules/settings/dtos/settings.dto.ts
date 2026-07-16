import { ApiProperty } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { SendingDomainDto } from './sending-domain.dto'

export class SettingsDto {
    @Expose()
    @Type(() => SendingDomainDto)
    @ApiProperty({ type: SendingDomainDto, nullable: true })
    sendingDomain: SendingDomainDto | null = null
}
