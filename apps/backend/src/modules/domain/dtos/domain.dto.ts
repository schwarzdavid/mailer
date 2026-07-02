import { ApiProperty } from '@nestjs/swagger'
import { Domain } from '../interfaces/domain.interface'

export class DomainDto {
    @ApiProperty({ type: Number })
    domainId!: number

    @ApiProperty({ type: String })
    fqdn!: string

    static fromDomain(domain: Domain): DomainDto {
        const dto = new DomainDto()

        dto.domainId = domain.domainId
        dto.fqdn = domain.fqdn

        return dto
    }
}
