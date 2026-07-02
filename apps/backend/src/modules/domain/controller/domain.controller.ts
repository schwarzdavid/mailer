import { Body, Controller, Logger, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { DomainCreateDto } from '../dtos/domain-create.dto'
import { DomainDto } from '../dtos/domain.dto'
import { DomainService } from '../services/domain.service'
import { DomainDnsService } from '../services/domain-dns.service'
import { ResponseDto } from '../../../decorators/ResponseDto'

@JwtAuth()
@ApiTags('domain')
@Controller('domain')
export class DomainController {
    private readonly logger = new Logger(DomainController.name)

    constructor(
        private readonly domainService: DomainService,
        private readonly domainDnsService: DomainDnsService
    ) {}

    @ResponseDto(DomainDto)
    @Post()
    async createDomain(@Body() domainCreate: DomainCreateDto): Promise<DomainDto> {
        this.logger.log(`Creating domain ${domainCreate.fqdn}`)

        const domain = await this.domainService.createDomain(domainCreate)
        const domainDns = this.domainDnsService.createDefaultDnsRecords(domain, domain.activeDkim)

        return {
            ...domain,
            dns: domainDns
        }
    }
}
