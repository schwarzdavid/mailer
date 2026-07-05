import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { DomainModel } from '../models/domain.model'
import { DomainDkimService } from './domain-dkim.service'
import { Domain, DomainWithDkim } from '../interfaces/domain.interface'
import { DomainDnsService } from './domain-dns.service'
import { parse } from 'tldts'

@Injectable()
export class DomainService {
    private readonly logger = new Logger(DomainService.name)

    constructor(
        private readonly domainDkimService: DomainDkimService,
        private readonly domainDnsService: DomainDnsService,
        @InjectModel(DomainModel) private readonly domainModel: typeof DomainModel,
    ) {}

    async createDomain(fqdn: string): Promise<DomainWithDkim> {
        const { domain: rootDomain } = parse(fqdn)
        if(!rootDomain) {
            throw new BadRequestException('Invalid domain.')
        }
        const domainModel = await this.domainModel.create({
            fqdn,
            rootDomain
        }, { returning: true })
        this.logger.log(`Created domain ${domainModel.fqdn}`)

        const dkim = await this.domainDkimService.createDkimForDomain(domainModel, true)
        this.logger.log(`Created DKIM for domain ${domainModel.fqdn}`)

        const dnsRecords = await this.domainDnsService.createDefaultDnsRecords(domainModel, dkim)
        this.logger.log(`Created DNS records for domain ${domainModel.fqdn}`)

        const domain = domainModel.get({ plain: true }) as DomainWithDkim

        domain.activeDkim = dkim
        domain.activeDkimId = dkim.dkimId
        domain.dkims = [dkim]
        domain.dnsRecords = dnsRecords

        return domain
    }

    async getDomains(): Promise<Domain[]> {
        const domains = await this.domainModel.findAll()

        return domains.map((domain) => domain.get({ plain: true }))
    }

    async getDomainById(domainId: number): Promise<Domain> {
        const domain = await this.domainModel.findByPk(domainId, { rejectOnEmpty: true })

        return domain.get({ plain: true })
    }
}
