import { ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { resolve4, resolve6 } from 'node:dns/promises'
import { SettingsModel } from '../models/settings.model.js'
import { SendingDomain, SendingDomainProposal, Settings } from '../interfaces/settings.interface.js'
import { DomainService } from '../../domain/services/domain.service.js'
import { DomainDnsService } from '../../domain/services/domain-dns.service.js'
import { Domain, SendingDomainIps } from '../../domain/interfaces/domain.interface.js'
import { Env } from '../../../config/env.schema.js'
import { SENDING_DOMAIN_LOCK_KEY } from '../settings.constants.js'

async function firstAddress(lookup: Promise<string[]>): Promise<string | null> {
    try {
        return (await lookup)[0] ?? null
    } catch {
        return null
    }
}

@Injectable()
export class SettingsService implements OnApplicationBootstrap {
    private readonly logger = new Logger(SettingsService.name)
    private readonly mailHostname: string

    constructor(
        private readonly sequelize: Sequelize,
        private readonly domainService: DomainService,
        private readonly domainDnsService: DomainDnsService,
        @InjectModel(SettingsModel) private readonly settingsModel: typeof SettingsModel,
        configService: ConfigService<Env, true>,
    ) {
        this.mailHostname = configService.get('MAIL_HOSTNAME', { infer: true })
    }

    async onApplicationBootstrap(): Promise<void> {
        await this.reconcileSendingDomain()
    }

    async getSettings(): Promise<Settings | null> {
        const settings = await this.settingsModel.findOne()

        return settings ? settings.get({ plain: true }) : null
    }

    async finishSetup(): Promise<void> {
        const settings = await this.settingsModel.findOne()
        if (!settings?.sendingDomainId) {
            throw new ConflictException('Configure a sending domain before finishing the setup.')
        }

        if (settings.setupFinishedAt === null) {
            settings.setupFinishedAt = new Date()
            await settings.save()
            this.logger.log('Finished setup')
        }
    }

    async getSendingDomain(): Promise<SendingDomain | null> {
        const settings = await this.settingsModel.findOne()
        if (!settings?.sendingDomainId) {
            return null
        }

        const domain = await this.domainService.getDomainById(settings.sendingDomainId)
        return this.toSendingDomain(domain, settings)
    }

    async getSendingDomainProposal(): Promise<SendingDomainProposal> {
        const [serverIpv4, serverIpv6] = await Promise.all([
            firstAddress(resolve4(this.mailHostname)),
            firstAddress(resolve6(this.mailHostname)),
        ])

        return { fqdn: this.mailHostname, serverIpv4, serverIpv6 }
    }

    configureSendingDomain(ips: SendingDomainIps): Promise<SendingDomain> {
        return this.withSendingDomainLock(() => this.applySendingDomain(ips))
    }

    reconcileSendingDomain(): Promise<void> {
        return this.withSendingDomainLock(async () => {
            const settings = await this.settingsModel.findOne()
            if (!settings?.sendingDomainId) {
                return
            }

            const current = await this.domainService.getDomainById(settings.sendingDomainId)
            if (current.fqdn === this.mailHostname) {
                return
            }

            if (await this.domainService.getDomainByFqdn(this.mailHostname)) {
                throw new Error(
                    `MAIL_HOSTNAME ${this.mailHostname} is registered as a customer domain. Delete that domain before switching the sending domain to it.`,
                )
            }

            this.logger.warn(
                `Sending domain ${current.fqdn} does not match MAIL_HOSTNAME ${this.mailHostname}, reconfiguring it`,
            )
            await this.applySendingDomain({ serverIpv4: settings.serverIpv4, serverIpv6: settings.serverIpv6 })
        })
    }

    async refreshSendingDomain(): Promise<SendingDomain> {
        const settings = await this.settingsModel.findOne()
        if (!settings?.sendingDomainId) {
            throw new NotFoundException('No sending domain configured.')
        }

        const domain = await this.domainDnsService.reloadDnsRecords(settings.sendingDomainId)
        return this.toSendingDomain(domain, settings)
    }

    private withSendingDomainLock<T>(work: () => Promise<T>): Promise<T> {
        return this.sequelize.transaction(async (transaction) => {
            await this.sequelize.query('SELECT pg_advisory_xact_lock(:key)', {
                replacements: { key: SENDING_DOMAIN_LOCK_KEY },
                transaction,
            })

            return work()
        })
    }

    private async applySendingDomain(ips: SendingDomainIps): Promise<SendingDomain> {
        const fqdn = this.mailHostname
        const settings = await this.settingsModel.findOne()
        const currentDomain = settings?.sendingDomainId
            ? await this.domainService.getDomainById(settings.sendingDomainId)
            : null

        if (currentDomain && currentDomain.fqdn !== fqdn) {
            await this.domainService.deleteDomain(currentDomain.domainId)
        }

        const domain =
            currentDomain?.fqdn === fqdn
                ? await this.domainService.recreateSendingDomainRecords(fqdn, ips)
                : await this.domainService.createSendingDomain(fqdn, ips)

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
