import { useI18n } from 'vue-i18n'
import type { DomainDnsRecordDto, DomainDto } from 'api'
import type { StatusTone } from '@/components/statusTone.ts'

export function domainRecords(domain: Pick<DomainDto, 'dns'>): DomainDnsRecordDto[] {
    return [domain.dns.spf, domain.dns.dkim, domain.dns.dmarc]
}

export function isDomainValid(domain: Pick<DomainDto, 'dns'>): boolean {
    return domainRecords(domain).every((record) => record.status === 'valid')
}

export function useDomainStatus() {
    const { t } = useI18n()

    function badge(records: DomainDnsRecordDto[]): { tone: StatusTone; label: string } {
        const valid = records.filter((record) => record.status === 'valid').length
        if (valid === records.length) {
            return { tone: 'success', label: t('status.valid') }
        }
        if (valid === 0) {
            return { tone: 'warning', label: t('status.invalid') }
        }
        return { tone: 'warning', label: t('status.partlyValid', { valid, total: records.length }) }
    }

    function invalidSummary(records: DomainDnsRecordDto[]): string | undefined {
        const invalid = records.filter((record) => record.status !== 'valid').map((record) => record.use.toUpperCase())
        if (invalid.length === 0) {
            return undefined
        }
        const names =
            invalid.length > 1
                ? t('dns.listAnd', { head: invalid.slice(0, -1).join(', '), last: invalid[invalid.length - 1] })
                : invalid[0]
        return t('dns.needAttention', { names }, invalid.length)
    }

    return {
        badge,
        domainBadge: (domain: Pick<DomainDto, 'dns'>) => badge(domainRecords(domain)),
        invalidSummary,
    }
}
