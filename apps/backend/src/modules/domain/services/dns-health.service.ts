import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/sequelize'
import { DomainModel } from '../models/domain.model'
import { DomainDnsService } from './domain-dns.service'
import { DNS_CHECK_INTERVAL_MS } from '../domain.constants'

@Injectable()
export class DnsHealthService {
    private readonly logger = new Logger(DnsHealthService.name)
    private checkRunning = false

    constructor(
        private readonly domainDnsService: DomainDnsService,
        @InjectModel(DomainModel) private readonly domainModel: typeof DomainModel,
    ) {}

    @Interval(DNS_CHECK_INTERVAL_MS)
    async handleCheckInterval(): Promise<void> {
        try {
            await this.checkAllDomains()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.logger.error(`DNS check round failed: ${message}`)
        }
    }

    async checkAllDomains(): Promise<void> {
        if (this.checkRunning) {
            return
        }
        this.checkRunning = true

        try {
            const domains = await this.domainModel.unscoped().findAll({ attributes: ['domainId', 'fqdn'] })
            for (const domain of domains) {
                try {
                    await this.domainDnsService.reloadDnsRecords(domain.domainId)
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    this.logger.error(`DNS check for ${domain.fqdn} failed: ${message}`)
                }
            }
        } finally {
            this.checkRunning = false
        }
    }
}
