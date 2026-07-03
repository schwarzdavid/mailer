import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    CreatedAt,
    DataType,
    DefaultScope,
    ForeignKey,
    HasMany,
    Model,
    PrimaryKey,
    Table,
    Unique,
    UpdatedAt,
} from 'sequelize-typescript'
import { Domain } from '../interfaces/domain.interface'
import { DomainDkimModel } from './domain-dkim.model'
import { DomainDnsModel } from './domain-dns.model'

@DefaultScope(() => ({
    include: [DomainDnsModel],
}))
@Table({
    tableName: 'domains',
    timestamps: true,
})
export class DomainModel
    extends Model<Domain, Omit<Domain, 'domainId' | 'dnsRecords' | 'lastCheckedAt' | 'activeDkimId'>>
    implements Domain
{
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare domainId: number

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare fqdn: string

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare rootDomain: string

    @AllowNull
    @ForeignKey(() => DomainDkimModel)
    @Column(DataType.INTEGER)
    declare activeDkimId: number

    @AllowNull
    @Column(DataType.DATE)
    lastCheckedAt: Date | null = null

    @BelongsTo(() => DomainDkimModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    activeDkim: DomainDkimModel | null = null

    @HasMany(() => DomainDkimModel)
    dkims: DomainDkimModel[] = []

    @HasMany(() => DomainDnsModel)
    dnsRecords: DomainDnsModel[] = []

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
