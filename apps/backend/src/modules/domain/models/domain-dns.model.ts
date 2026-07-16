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
    indexes: [
        {
            name: 'domain_dns_host_use_unique',
            unique: true,
            fields: ['host', 'use'],
        },
    ],
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
    @Column(DataType.TEXT)
    declare value: string

    @AllowNull
    @Column(DataType.TEXT)
    declare current: string | null

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
