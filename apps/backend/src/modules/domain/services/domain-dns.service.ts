import { Injectable } from '@nestjs/common'
import { Domain } from '../interfaces/domain.interface'
import { DomainDkim } from '../interfaces/domain-dkim.interface'
import {
    DomainDnsRecord,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface'
import { InjectModel } from '@nestjs/sequelize'
import { DomainDnsModel } from '../models/domain-dns.model'

@Injectable()
export class DomainDnsService {
    private static readonly SPF_MAILER = 'spf.schwarzdavid.email'

    private static readonly DKIM_PUBLIC_KEY_PREFIX = '-----BEGIN PUBLIC KEY-----'
    private static readonly DKIM_PUBLIC_KEY_SUFFIX = '-----END PUBLIC KEY-----'

    constructor(@InjectModel(DomainDnsModel) private readonly domainDnsModel: typeof DomainDnsModel) {}

    createDefaultDnsRecords(
        domain: Domain,
        dkim: DomainDkim,
    ): Promise<DomainDnsRecord[]> {
        if (domain.domainId !== dkim.domainId) {
            throw new Error('Domain and DKIM do not match')
        }

        return Promise.all([
            this.createDefaultSpfRecord(domain),
            this.createDefaultDkimRecord(domain, dkim),
            this.createDefaultDmarcRecord(domain),
        ])
    }

    private async createDefaultSpfRecord(domain: Domain): Promise<DomainDnsRecord> {
        const host = domain.fqdn
        const value = `v=spf1 include:${DomainDnsService.SPF_MAILER} ~all`

        const record = await this.domainDnsModel.create(
            {
                domainId: domain.domainId,
                host,
                value,
                use: DomainDnsRecordUse.SPF,
                current: null,
                status: DomainDnsRecordStatus.INVALID,
                type: DomainDnsRecordType.TXT,
            },
            { returning: true },
        )

        return record.get({ plain: true })
    }

    private async createDefaultDkimRecord(domain: Domain, dkim: DomainDkim): Promise<DomainDnsRecord> {
        const dkimKey = this.stripDkimPublicKey(dkim.publicKey)

        const host = `${dkim.selector}._domainkey.${domain.fqdn}`
        const value = `v=DKIM1; k=${dkim.algorithm}; p=${dkimKey}`

        const record = await this.domainDnsModel.create(
            {
                domainId: domain.domainId,
                host,
                value,
                use: DomainDnsRecordUse.DKIM,
                current: null,
                status: DomainDnsRecordStatus.INVALID,
                type: DomainDnsRecordType.TXT,
            },
            { returning: true },
        )

        return record.get({ plain: true })
    }

    private async createDefaultDmarcRecord(domain: Domain): Promise<DomainDnsRecord> {
        const host = `_dmarc.${domain.fqdn}`
        const value = 'v=DMARC1; p=none;'

        const record = await this.domainDnsModel.create({
            domainId: domain.domainId,
            host,
            value,
            use: DomainDnsRecordUse.DMARC,
            current: null,
            status: DomainDnsRecordStatus.INVALID,
            type: DomainDnsRecordType.TXT,
        }, {returning: true})

        return record.get({ plain: true })
    }

    private stripDkimPublicKey(dkimPublicKey: string): string {
        return dkimPublicKey
            .replace(DomainDnsService.DKIM_PUBLIC_KEY_PREFIX, '')
            .replace(DomainDnsService.DKIM_PUBLIC_KEY_SUFFIX, '')
            .replace(/\s+/g, '')
    }
}
