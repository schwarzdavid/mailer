import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { Op } from 'sequelize'
import { Domain, SendingDomainIps } from '../interfaces/domain.interface'
import { DomainDkim } from '../interfaces/domain-dkim.interface'
import {
    DomainDnsRecord,
    DomainDnsRecordCreate,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface'
import { InjectModel } from '@nestjs/sequelize'
import { DomainDnsModel } from '../models/domain-dns.model'
import { resolve, resolve4, resolve6, resolveMx, reverse } from 'node:dns/promises'
import { DomainModel } from '../models/domain.model'
import { SettingsModel } from '../../settings/models/settings.model'
import ErrnoException = NodeJS.ErrnoException

@Injectable()
export class DomainDnsService {
    private static readonly DKIM_PUBLIC_KEY_PREFIX = '-----BEGIN PUBLIC KEY-----'
    private static readonly DKIM_PUBLIC_KEY_SUFFIX = '-----END PUBLIC KEY-----'
    private static readonly MISSING_RECORD_CODES = ['ENOTFOUND', 'ENODATA']

    private readonly logger = new Logger(DomainDnsService.name)

    constructor(
        @InjectModel(DomainModel) private readonly domainModel: typeof DomainModel,
        @InjectModel(DomainDnsModel) private readonly domainDnsModel: typeof DomainDnsModel,
        @InjectModel(SettingsModel) private readonly settingsModel: typeof SettingsModel,
    ) {}

    async createDefaultDnsRecords(domain: Domain, dkim: DomainDkim): Promise<DomainDnsRecord[]> {
        if (domain.domainId !== dkim.domainId) {
            throw new Error('Domain and DKIM do not match')
        }

        const spfIncludeHost = await this.getSpfIncludeHost()

        return Promise.all([
            this.createRecord({
                domainId: domain.domainId,
                host: domain.fqdn,
                value: `v=spf1 include:${spfIncludeHost} ~all`,
                use: DomainDnsRecordUse.SPF,
                current: null,
                status: DomainDnsRecordStatus.INVALID,
                type: DomainDnsRecordType.TXT,
            }),
            this.createDefaultDkimRecord(domain, dkim),
            this.createDefaultDmarcRecord(domain),
        ])
    }

    private async getSpfIncludeHost(): Promise<string> {
        const settings = await this.settingsModel.findOne()
        if (!settings?.sendingDomainId) {
            throw new BadRequestException('No sending domain configured.')
        }
        const sendingDomain = await this.domainModel.findByPk(settings.sendingDomainId, { rejectOnEmpty: true })
        return sendingDomain.fqdn
    }

    async createSendingDomainDnsRecords(
        domain: Domain,
        dkim: DomainDkim,
        ips: SendingDomainIps,
    ): Promise<DomainDnsRecord[]> {
        if (domain.domainId !== dkim.domainId) {
            throw new Error('Domain and DKIM do not match')
        }

        const spfMechanisms = [`ip4:${ips.serverIpv4}`]
        if (ips.serverIpv6) {
            spfMechanisms.push(`ip6:${ips.serverIpv6}`)
        }

        const creates: DomainDnsRecordCreate[] = [
            {
                domainId: domain.domainId,
                host: domain.fqdn,
                value: ips.serverIpv4,
                use: DomainDnsRecordUse.A,
                current: null,
                status: DomainDnsRecordStatus.INVALID,
                type: DomainDnsRecordType.A,
            },
            {
                domainId: domain.domainId,
                host: domain.fqdn,
                value: `10 ${domain.fqdn}`,
                use: DomainDnsRecordUse.MX,
                current: null,
                status: DomainDnsRecordStatus.INVALID,
                type: DomainDnsRecordType.MX,
            },
            {
                domainId: domain.domainId,
                host: domain.fqdn,
                value: `v=spf1 ${spfMechanisms.join(' ')} -all`,
                use: DomainDnsRecordUse.SPF,
                current: null,
                status: DomainDnsRecordStatus.INVALID,
                type: DomainDnsRecordType.TXT,
            },
            {
                domainId: domain.domainId,
                host: ips.serverIpv4,
                value: domain.fqdn,
                use: DomainDnsRecordUse.PTR,
                current: null,
                status: DomainDnsRecordStatus.INVALID,
                type: DomainDnsRecordType.PTR,
            },
        ]

        if (ips.serverIpv6) {
            creates.push(
                {
                    domainId: domain.domainId,
                    host: domain.fqdn,
                    value: ips.serverIpv6,
                    use: DomainDnsRecordUse.AAAA,
                    current: null,
                    status: DomainDnsRecordStatus.INVALID,
                    type: DomainDnsRecordType.AAAA,
                },
                {
                    domainId: domain.domainId,
                    host: ips.serverIpv6,
                    value: domain.fqdn,
                    use: DomainDnsRecordUse.PTR,
                    current: null,
                    status: DomainDnsRecordStatus.INVALID,
                    type: DomainDnsRecordType.PTR,
                },
            )
        }

        const records: DomainDnsRecord[] = []
        for (const values of creates) {
            records.push(await this.createRecord(values))
        }
        records.push(await this.createDefaultDkimRecord(domain, dkim))
        records.push(await this.createDefaultDmarcRecord(domain))

        return records
    }

    async regenerateCustomerSpfRecords(sendingDomain: Pick<Domain, 'domainId' | 'fqdn'>): Promise<void> {
        await this.domainDnsModel.update(
            {
                value: `v=spf1 include:${sendingDomain.fqdn} ~all`,
                status: DomainDnsRecordStatus.INVALID,
            },
            {
                where: {
                    use: DomainDnsRecordUse.SPF,
                    domainId: { [Op.ne]: sendingDomain.domainId },
                },
            },
        )
    }

    async deleteRecordsForDomain(domainId: number): Promise<void> {
        await this.domainDnsModel.destroy({ where: { domainId } })
    }

    async reloadDnsRecords(domainId: number): Promise<Domain> {
        const domain = await this.domainModel.findByPk(domainId, { rejectOnEmpty: true })
        const dnsRecords = await this.domainDnsModel.findAll({ where: { domainId } })

        this.logger.log(`Reloading DNS records for domain ${domain.fqdn}`)

        for (const record of dnsRecords) {
            const currentValues = await this.resolveCurrentValues(record)
            const matchedValue = currentValues.find((value) => value === record.value)

            this.logger.log(
                `Got ${record.type.toUpperCase()} values for ${record.host}: ${currentValues.join(', ') || '---'}`,
            )

            record.current = matchedValue ?? currentValues[0] ?? null
            record.status = matchedValue ? DomainDnsRecordStatus.VALID : DomainDnsRecordStatus.INVALID

            await record.save()
        }

        domain.lastCheckedAt = new Date()
        await domain.save()

        domain.dnsRecords = dnsRecords

        return domain.get({ plain: true })
    }

    private async resolveCurrentValues(record: DomainDnsRecord): Promise<string[]> {
        try {
            switch (record.type) {
                case DomainDnsRecordType.TXT:
                    return (await resolve(record.host, 'TXT')).map((chunks) => chunks.join(''))
                case DomainDnsRecordType.A:
                    return await resolve4(record.host)
                case DomainDnsRecordType.AAAA:
                    return await resolve6(record.host)
                case DomainDnsRecordType.MX:
                    return (await resolveMx(record.host)).map((entry) => `${entry.priority} ${entry.exchange}`)
                case DomainDnsRecordType.PTR:
                    return await reverse(record.host)
            }
        } catch (err) {
            const code = (err as ErrnoException)?.code
            if (code && DomainDnsService.MISSING_RECORD_CODES.includes(code)) {
                return []
            }
            throw err
        }
    }

    private async createRecord(values: DomainDnsRecordCreate): Promise<DomainDnsRecord> {
        const record = await this.domainDnsModel.create(values, { returning: true })
        return record.get({ plain: true })
    }

    private async createDefaultDkimRecord(domain: Domain, dkim: DomainDkim): Promise<DomainDnsRecord> {
        const dkimKey = this.stripDkimPublicKey(dkim.publicKey)

        const host = `${dkim.selector}._domainkey.${domain.fqdn}`
        const value = `v=DKIM1; k=${dkim.algorithm}; p=${dkimKey}`

        return this.createRecord({
            domainId: domain.domainId,
            host,
            value,
            use: DomainDnsRecordUse.DKIM,
            current: null,
            status: DomainDnsRecordStatus.INVALID,
            type: DomainDnsRecordType.TXT,
        })
    }

    private async createDefaultDmarcRecord(domain: Domain): Promise<DomainDnsRecord> {
        const host = `_dmarc.${domain.fqdn}`
        const value = 'v=DMARC1; p=none;'

        return this.createRecord({
            domainId: domain.domainId,
            host,
            value,
            use: DomainDnsRecordUse.DMARC,
            current: null,
            status: DomainDnsRecordStatus.INVALID,
            type: DomainDnsRecordType.TXT,
        })
    }

    private stripDkimPublicKey(dkimPublicKey: string): string {
        return dkimPublicKey
            .replace(DomainDnsService.DKIM_PUBLIC_KEY_PREFIX, '')
            .replace(DomainDnsService.DKIM_PUBLIC_KEY_SUFFIX, '')
            .replace(/\s+/g, '')
    }
}
