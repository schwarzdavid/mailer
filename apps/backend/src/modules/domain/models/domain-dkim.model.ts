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
} from 'sequelize-typescript'
import {
    type DomainDkim,
    type DomainDkimAlgorithm,
    type DomainDkimCreate,
    type DomainDkimKeyBits,
} from '../interfaces/domain-dkim.interface'
import { DomainModel } from './domain.model'

@Table({
    tableName: 'domain_dkim',
    updatedAt: false,
    paranoid: true,
})
export class DomainDkimModel extends Model<DomainDkim, DomainDkimCreate> implements DomainDkim {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare dkimId: number

    @AllowNull(false)
    @ForeignKey(() => DomainModel)
    @Column(DataType.INTEGER)
    declare domainId: number

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare selector: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare algorithm: DomainDkimAlgorithm

    @AllowNull(false)
    @Column(DataType.SMALLINT)
    declare keyBits: DomainDkimKeyBits

    @AllowNull(false)
    @Column(DataType.TEXT)
    declare privateKey: string

    @AllowNull(false)
    @Column(DataType.TEXT)
    declare publicKey: string

    @CreatedAt
    declare createdAt: Date

    @BelongsTo(() => DomainModel, {
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
    })
    domain: DomainModel | null = null
}
