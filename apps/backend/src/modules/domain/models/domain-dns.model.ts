import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    CreatedAt,
    DataType,
    ForeignKey,
    Model,
    PrimaryKey,
    Table,
    UpdatedAt,
} from 'sequelize-typescript'
import {
    DomainDnsRecord,
    DomainDnsRecordCreate,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../interfaces/domain-dns.interface'
import { DomainModel } from './domain.model'

@Table({
    tableName: 'domain_dns',
})
export class DomainDnsModel extends Model<DomainDnsRecord, DomainDnsRecordCreate> implements DomainDnsRecord {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare dnsId: number

    @ForeignKey(() => DomainModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare domainId: number

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare type: DomainDnsRecordType

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare use: DomainDnsRecordUse

    @AllowNull(false)
    @Column(DataType.ENUM(...Object.values(DomainDnsRecordStatus)))
    declare status: DomainDnsRecordStatus

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare host: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare value: string

    @AllowNull
    @Column(DataType.STRING(255))
    current: string | null = null

    @BelongsTo(() => DomainModel, {
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
    })
    domain?: DomainModel

    @UpdatedAt
    declare updatedAt: Date

    @CreatedAt
    declare createdAt: Date
}
