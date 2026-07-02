import {
    DomainDnsRecord,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface'
import { Expose } from 'class-transformer'

export class DomainDnsRecordDto implements DomainDnsRecord {
    @Expose()
    current!: string | null

    @Expose()
    host!: string

    @Expose()
    status!: DomainDnsRecordStatus

    @Expose()
    type!: DomainDnsRecordType

    @Expose()
    use!: DomainDnsRecordUse

    @Expose()
    value!: string
}
