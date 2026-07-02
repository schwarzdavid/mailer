import { Injectable } from '@nestjs/common'
import { Domain } from '../interfaces/domain.interface'
import { DomainDkim } from '../interfaces/domain-dkim.interface'
import {
    DomainDnsRecord,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface'

@Injectable()
export class DomainDnsService {
    private static readonly SPF_MAILER = 'spf.schwarzdavid.email'

    private static readonly DKIM_PUBLIC_KEY_PREFIX = '-----BEGIN PUBLIC KEY-----'
    private static readonly DKIM_PUBLIC_KEY_SUFFIX = '-----END PUBLIC KEY-----'

    createDefaultDnsRecords(domain: Domain, dkim: DomainDkim): Record<DomainDnsRecordUse, DomainDnsRecord> {
        if (domain.domainId !== dkim.domainId) {
            throw new Error('Domain and DKIM do not match')
        }

        return {
            [DomainDnsRecordUse.SPF]: this.createDefaultSpfRecord(domain),
            [DomainDnsRecordUse.DKIM]: this.createDefaultDkimRecord(domain, dkim),
            [DomainDnsRecordUse.DMARC]: this.createDefaultDmarcRecord(domain),
        }
    }

    private createDefaultSpfRecord(domain: Domain): DomainDnsRecord {
        const host = domain.fqdn
        const value = `v=spf1 include:${DomainDnsService.SPF_MAILER} ~all`

        return {
            host,
            value,
            use: DomainDnsRecordUse.SPF,
            current: null,
            status: DomainDnsRecordStatus.INVALID,
            type: DomainDnsRecordType.TXT,
        }
    }

    private createDefaultDkimRecord(domain: Domain, dkim: DomainDkim): DomainDnsRecord {
        const dkimKey = this.stripDkimPublicKey(dkim.publicKey)

        const host = `${dkim.selector}._domainkey.${domain.fqdn}`
        const value = `v=DKIM1; k=${dkim.algorithm}; p=${dkimKey}`

        return {
            host,
            value,
            use: DomainDnsRecordUse.DKIM,
            current: null,
            status: DomainDnsRecordStatus.INVALID,
            type: DomainDnsRecordType.TXT,
        }
    }

    private createDefaultDmarcRecord(domain: Domain): DomainDnsRecord {
        const host = `_dmarc.${domain.fqdn}`
        const value = 'v=DMARC1; p=none;'

        return {
            host,
            value,
            use: DomainDnsRecordUse.DMARC,
            current: null,
            status: DomainDnsRecordStatus.INVALID,
            type: DomainDnsRecordType.TXT,
        }
    }

    private stripDkimPublicKey(dkimPublicKey: string): string {
        return dkimPublicKey
            .replace(DomainDnsService.DKIM_PUBLIC_KEY_PREFIX, '')
            .replace(DomainDnsService.DKIM_PUBLIC_KEY_SUFFIX, '')
            .replace(/\s+/g, '')
    }
}
