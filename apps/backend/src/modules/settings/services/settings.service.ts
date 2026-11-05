import { ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { parse } from 'tldts'
import { SettingsModel } from '../models/settings.model.js'
import { SendingDomain, Settings } from '../interfaces/settings.interface.js'
import { DomainService } from '../../domain/services/domain.service.js'
import { DomainDnsService } from '../../domain/services/domain-dns.service.js'
import { DnsHealthService } from '../../domain/services/dns-health.service.js'
import { Domain, SendingDomainIps } from '../../domain/interfaces/domain.interface.js'
import { DomainDnsRecord, DomainDnsRecordUse } from '../../domain/interfaces/domain-dns.interface.js'
import { Env } from '../../../config/env.schema.js'
import { SENDING_DOMAIN_LOCK_KEY } from '../settings.constants.js'
import { describeError } from '../../../helpers/describe-error.js'

function recordValue(records: DomainDnsRecord[], use: DomainDnsRecordUse): string | null {
    return records.find((record) => record.use === use)?.value ?? null
}

function sameItems(left: string[], right: string[]): boolean {
    const sortedRight = [...right].sort()
    return left.length === right.length && [...left].sort().every((item, index) => item === sortedRight[index])
}

function recordsMatchIps(records: DomainDnsRecord[], ips: SendingDomainIps): boolean {
    const addresses = ips.serverIpv6 ? [ips.serverIpv4, ips.serverIpv6] : [ips.serverIpv4]
    const expectedUses = [
        DomainDnsRecordUse.A,
        DomainDnsRecordUse.MX,
        DomainDnsRecordUse.SPF,
        DomainDnsRecordUse.DKIM,
        DomainDnsRecordUse.DMARC,
        ...(ips.serverIpv6 ? [DomainDnsRecordUse.AAAA] : []),
        ...addresses.map(() => DomainDnsRecordUse.PTR),
    ]
    const ptrHosts = records.filter((record) => record.use === DomainDnsRecordUse.PTR).map((record) => record.host)

    return (
        sameItems(
            records.map((record) => record.use),
            expectedUses,
        ) &&
        sameItems(ptrHosts, addresses) &&
        recordValue(records, DomainDnsRecordUse.A) === ips.serverIpv4 &&
        recordValue(records, DomainDnsRecordUse.AAAA) === ips.serverIpv6
    )
}

function isSendingDomain(domain: Domain): boolean {
    return domain.dnsRecords.some((record) => record.use === DomainDnsRecordUse.A)
}

@Injectable()
export class SettingsService implements OnApplicationBootstrap {
    private readonly logger = new Logger(SettingsService.name)
    private readonly mailHostname: string
    private readonly serverIps: SendingDomainIps
    private readonly sendRequireValidDns: boolean

    constructor(
        private readonly sequelize: Sequelize,
        private readonly domainService: DomainService,
        private readonly domainDnsService: DomainDnsService,
        private readonly dnsHealthService: DnsHealthService,
        @InjectModel(SettingsModel) private readonly settingsModel: typeof SettingsModel,
        configService: ConfigService<Env, true>,
    ) {
        this.mailHostname = configService.get('MAIL_HOSTNAME', { infer: true })
        this.serverIps = {
            serverIpv4: configService.get('MAIL_SERVER_IPV4', { infer: true }),
            serverIpv6: configService.get('MAIL_SERVER_IPV6', { infer: true }) ?? null,
        }
        this.sendRequireValidDns = configService.get('SEND_REQUIRE_VALID_DNS', { infer: true })
    }

    async onApplicationBootstrap(): Promise<void> {
        await this.reconcileSendingDomain()

        if (this.sendRequireValidDns) {
            this.dnsHealthService.handleCheckInterval().catch((error: unknown) => {
                this.logger.error(`Startup DNS check failed: ${describeError(error)}`)
            })
        }
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
        return this.toSendingDomain(domain)
    }

    reconcileSendingDomain(): Promise<void> {
        return this.withSendingDomainLock(async () => {
            const settings = await this.settingsModel.findOne()
            const current = settings?.sendingDomainId
                ? await this.domainService.getDomainById(settings.sendingDomainId)
                : await this.adoptOrphanedSendingDomain(settings)

            if (current?.fqdn === this.mailHostname) {
                if (!recordsMatchIps(current.dnsRecords, this.serverIps)) {
                    await this.regenerateRecords()
                }
                return
            }

            await this.assertMailHostnameIsFree(current)

            if (current) {
                this.logger.warn(
                    `Sending domain ${current.fqdn} does not match MAIL_HOSTNAME ${this.mailHostname}, reconfiguring it`,
                )
                await this.domainService.deleteDomain(current.domainId)
            }

            const domain = await this.domainService.createSendingDomain(this.mailHostname, this.serverIps)
            await this.pointSettingsAt(settings, domain)

            await this.domainDnsService.regenerateCustomerSpfRecords(domain)
            this.logger.log(`Configured sending domain ${domain.fqdn}`)
            await this.reloadRecords(domain)
        })
    }

    async refreshSendingDomain(): Promise<SendingDomain> {
        const settings = await this.settingsModel.findOne()
        if (!settings?.sendingDomainId) {
            throw new NotFoundException('No sending domain configured.')
        }

        const domain = await this.domainDnsService.reloadDnsRecords(settings.sendingDomainId)
        return this.toSendingDomain(domain)
    }

    private async adoptOrphanedSendingDomain(settings: SettingsModel | null): Promise<Domain | null> {
        const domain = await this.domainService.getDomainByFqdn(this.mailHostname)
        if (!domain || !isSendingDomain(domain)) {
            return null
        }

        this.logger.warn(`Adopting the sending domain ${domain.fqdn} that no settings row pointed to`)
        await this.pointSettingsAt(settings, domain)
        await this.domainDnsService.regenerateCustomerSpfRecords(domain)
        return domain
    }

    private async pointSettingsAt(settings: SettingsModel | null, domain: Domain): Promise<void> {
        if (settings) {
            settings.sendingDomainId = domain.domainId
            await settings.save()
        } else {
            await this.settingsModel.create({ sendingDomainId: domain.domainId }, { returning: true })
        }
    }

    private async regenerateRecords(): Promise<void> {
        const { serverIpv4, serverIpv6 } = this.serverIps
        const addresses = serverIpv6 ? `${serverIpv4} and ${serverIpv6}` : serverIpv4
        this.logger.warn(
            `Server addresses of sending domain ${this.mailHostname} changed to ${addresses}, regenerating its DNS records`,
        )

        const domain = await this.domainService.recreateSendingDomainRecords(this.mailHostname, this.serverIps)
        await this.reloadRecords(domain)
    }

    private async assertMailHostnameIsFree(current: Domain | null): Promise<void> {
        if (await this.domainService.getDomainByFqdn(this.mailHostname)) {
            throw new Error(
                `MAIL_HOSTNAME ${this.mailHostname} is registered as a customer domain. Delete that domain before switching the sending domain to it.`,
            )
        }

        const { domain: rootDomain } = parse(this.mailHostname)
        const conflictingDomain = rootDomain
            ? await this.domainService.getDomainByRootDomain(rootDomain, current?.domainId)
            : null
        if (conflictingDomain) {
            throw new Error(
                `MAIL_HOSTNAME ${this.mailHostname} shares the registrable domain ${rootDomain} with the customer domain ${conflictingDomain.fqdn}. Rename MAIL_HOSTNAME or delete that domain before switching.`,
            )
        }
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

    private async reloadRecords(domain: Domain): Promise<void> {
        try {
            await this.domainDnsService.reloadDnsRecords(domain.domainId)
        } catch (error) {
            this.logger.error(`Initial DNS check for ${domain.fqdn} failed: ${describeError(error)}`)
        }
    }

    private toSendingDomain(domain: Domain): SendingDomain {
        return {
            fqdn: domain.fqdn,
            serverIpv4: this.serverIps.serverIpv4,
            serverIpv6: this.serverIps.serverIpv6,
            lastCheckedAt: domain.lastCheckedAt,
            records: domain.dnsRecords,
        }
    }
}
