import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { SendingDomainProposal } from '../interfaces/settings.interface.js'

export class SendingDomainProposalDto implements SendingDomainProposal {
    @Expose()
    @ApiProperty({ type: String })
    fqdn!: string

    @Expose()
    @ApiProperty({ type: String, nullable: true })
    serverIpv4: string | null = null

    @Expose()
    @ApiProperty({ type: String, nullable: true })
    serverIpv6: string | null = null
}
