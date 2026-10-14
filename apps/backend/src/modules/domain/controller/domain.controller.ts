import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { RequireAbility } from '../../permission/decorators/RequireAbility.js'
import { DomainCreateDto } from '../dtos/domain-create.dto.js'
import { DomainDto } from '../dtos/domain.dto.js'
import { DomainService } from '../services/domain.service.js'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { DomainDnsDto } from '../dtos/domain-dns.dto.js'
import { DomainDnsService } from '../services/domain-dns.service.js'

@JwtAuth()
@ApiTags('domain')
@Controller('domain')
export class DomainController {
    constructor(
        private readonly domainService: DomainService,
        private readonly domainDnsService: DomainDnsService,
    ) {}

    @RequireAbility({ action: 'create', subject: 'Domain' })
    @ResponseDto(DomainDto)
    @Post()
    async createDomain(@Body() { fqdn }: DomainCreateDto): Promise<DomainDto> {
        const domain = await this.domainService.createDomain(fqdn)

        return {
            ...domain,
            dns: DomainDnsDto.fromArray(domain.dnsRecords),
        }
    }

    @RequireAbility({ action: 'read', subject: 'Domain' })
    @SerializeOptions({ type: DomainDto })
    @Get()
    async getDomains(): Promise<DomainDto[]> {
        const domains = await this.domainService.getDomains()

        return domains.map((domain) => ({
            ...domain,
            dns: DomainDnsDto.fromArray(domain.dnsRecords),
        }))
    }

    @RequireAbility({ action: 'read', subject: 'Domain' })
    @ResponseDto(DomainDto)
    @Get(':domainId')
    async getDomain(@Param('domainId', ParseIntPipe) domainId: number): Promise<DomainDto> {
        const domain = await this.domainService.getDomainById(domainId)

        return {
            ...domain,
            dns: DomainDnsDto.fromArray(domain.dnsRecords),
        }
    }

    @RequireAbility({ action: 'update', subject: 'Domain' })
    @ResponseDto(DomainDto)
    @Post(':domainId/refresh')
    async refreshDomainRecords(@Param('domainId', ParseIntPipe) domainId: number): Promise<DomainDto> {
        const domain = await this.domainDnsService.reloadDnsRecords(domainId)

        return {
            ...domain,
            dns: DomainDnsDto.fromArray(domain.dnsRecords),
        }
    }

    @RequireAbility({ action: 'delete', subject: 'Domain' })
    @Delete(':domainId')
    async deleteDomain(@Param('domainId', ParseIntPipe) domainId: number): Promise<void> {
        await this.domainService.deleteUnusedDomain(domainId)
    }
}
