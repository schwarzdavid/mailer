import {
    DomainDnsRecord,
    DomainDnsRecordIssue,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface.js'
import { Expose, Transform } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { MxRecordValue, parseMxRecordValue } from '../helpers/mx-record-value.js'

const mxPartsOf = ({ type, value }: Pick<DomainDnsRecord, 'type' | 'value'>): MxRecordValue | null =>
    type === DomainDnsRecordType.MX ? parseMxRecordValue(value) : null

export class DomainDnsRecordDto implements Omit<DomainDnsRecord, 'dnsId' | 'domainId' | 'createdAt' | 'updatedAt'> {
    @Expose()
    current!: string | null

    @Expose()
    host!: string

    @Expose()
    @ApiProperty({ enum: [...Object.values(DomainDnsRecordIssue), null], nullable: true })
    issue!: DomainDnsRecordIssue | null

    @Expose()
    status!: DomainDnsRecordStatus

    @Expose()
    type!: DomainDnsRecordType

    @Expose()
    use!: DomainDnsRecordUse

    @Expose()
    @ApiProperty({ description: 'The record data; for an MX record only the mail server, its priority is `priority`.' })
    @Transform(
        ({ obj }) => {
            const record = obj as DomainDnsRecordDto
            return mxPartsOf(record)?.exchange ?? record.value
        },
        { toPlainOnly: true },
    )
    value!: string

    @Expose()
    @ApiProperty({ type: Number, nullable: true, description: 'The priority of an MX record, null for other types.' })
    get priority(): number | null {
        return mxPartsOf(this)?.priority ?? null
    }
}
