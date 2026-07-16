import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { SettingsModel } from '../models/settings.model'
import { SendingDomain, SendingDomainConfigure, Settings } from '../interfaces/settings.interface'
import { DomainService } from '../../domain/services/domain.service'
import { DomainDnsService } from '../../domain/services/domain-dns.service'
import { Domain, SendingDomainIps } from '../../domain/interfaces/domain.interface'

@Injectable()
export class SettingsService {
    private readonly logger = new Logger(SettingsService.name)

    constructor(
        private readonly domainService: DomainService,
        private readonly domainDnsService: DomainDnsService,
        @InjectModel(SettingsModel) private readonly settingsModel: typeof SettingsModel,
    ) {}

    async getSendingDomain(): Promise<SendingDomain | null> {
        const settings = await this.settingsModel.findOne()
        if (!settings?.sendingDomainId) {
            return null
        }
        const domain = await this.domainService.getDomainById(settings.sendingDomainId)

        return this.toSendingDomain(domain, settings)
    }

    async configureSendingDomain(config: SendingDomainConfigure): Promise<SendingDomain> {
        const settings = await this.settingsModel.findOne()
        const currentDomain = settings?.sendingDomainId
            ? await this.domainService.getDomainById(settings.sendingDomainId)
            : null
        const ips: SendingDomainIps = { serverIpv4: config.serverIpv4, serverIpv6: config.serverIpv6 }

        if (currentDomain && currentDomain.fqdn !== config.fqdn) {
            await this.domainService.deleteDomain(currentDomain.domainId)
        }

        const domain =
            currentDomain?.fqdn === config.fqdn
                ? await this.domainService.recreateSendingDomainRecords(config.fqdn, ips)
                : await this.domainService.createSendingDomain(config.fqdn, ips)

        let updatedSettings: Settings
        if (settings) {
            settings.sendingDomainId = domain.domainId
            settings.serverIpv4 = ips.serverIpv4
            settings.serverIpv6 = ips.serverIpv6
            await settings.save()
            updatedSettings = settings
        } else {
            updatedSettings = await this.settingsModel.create(
                { sendingDomainId: domain.domainId, ...ips },
                { returning: true },
            )
        }

        await this.domainDnsService.regenerateCustomerSpfRecords(domain)
        this.logger.log(`Configured sending domain ${domain.fqdn}`)

        return this.toSendingDomain(await this.reloadRecords(domain), updatedSettings)
    }

    async refreshSendingDomain(): Promise<SendingDomain> {
        const settings = await this.settingsModel.findOne()
        if (!settings?.sendingDomainId) {
            throw new NotFoundException('No sending domain configured.')
        }
        const domain = await this.domainDnsService.reloadDnsRecords(settings.sendingDomainId)

        return this.toSendingDomain(domain, settings)
    }

    private async reloadRecords(domain: Domain): Promise<Domain> {
        try {
            return await this.domainDnsService.reloadDnsRecords(domain.domainId)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.logger.error(`Initial DNS check for ${domain.fqdn} failed: ${message}`)
            return domain
        }
    }

    private toSendingDomain(domain: Domain, settings: Pick<Settings, 'serverIpv4' | 'serverIpv6'>): SendingDomain {
        return {
            fqdn: domain.fqdn,
            serverIpv4: settings.serverIpv4,
            serverIpv6: settings.serverIpv6,
            lastCheckedAt: domain.lastCheckedAt,
            records: domain.dnsRecords,
        }
    }
}
