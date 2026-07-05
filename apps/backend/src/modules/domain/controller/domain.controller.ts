import { Body, Controller, Get, Param, Post, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { DomainCreateDto } from '../dtos/domain-create.dto'
import { DomainDto } from '../dtos/domain.dto'
import { DomainService } from '../services/domain.service'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { DomainDnsDto } from '../dtos/domain-dns.dto'
import { DomainDnsService } from '../services/domain-dns.service'

@JwtAuth()
@ApiTags('domain')
@Controller('domain')
export class DomainController {
    constructor(
        private readonly domainService: DomainService,
        private readonly domainDnsService: DomainDnsService,
    ) {}

    @ResponseDto(DomainDto)
    @Post()
    async createDomain(@Body() { fqdn }: DomainCreateDto): Promise<DomainDto> {
        const domain = await this.domainService.createDomain(fqdn)

        return {
            ...domain,
            dns: DomainDnsDto.fromArray(domain.dnsRecords),
        }
    }

    @SerializeOptions({ type: DomainDto })
    @Get()
    async getDomains(): Promise<DomainDto[]> {
        const domains = await this.domainService.getDomains()

        return domains.map((domain) => ({
            ...domain,
            dns: DomainDnsDto.fromArray(domain.dnsRecords),
        }))
    }

    @ResponseDto(DomainDto)
    @Get(':domainId')
    async getDomain(@Param('domainId') domainId: number): Promise<DomainDto> {
        const domain = await this.domainService.getDomainById(domainId)

        return {
            ...domain,
            dns: DomainDnsDto.fromArray(domain.dnsRecords),
        }
    }

    @ResponseDto(DomainDto)
    @Post(':domainId/refresh')
    async refreshDomainRecords(@Param('domainId') domainId: number): Promise<DomainDto> {
        const domain = await this.domainDnsService.reloadDnsRecords(domainId)

        return {
            ...domain,
            dns: DomainDnsDto.fromArray(domain.dnsRecords),
        }
    }
}
