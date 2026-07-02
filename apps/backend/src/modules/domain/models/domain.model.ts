import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    CreatedAt,
    DataType,
    ForeignKey,
    HasMany,
    Model,
    PrimaryKey,
    Table,
    UpdatedAt,
} from 'sequelize-typescript'
import { Domain, DomainCreate } from '../interfaces/domain.interface'
import { DomainDkimModel } from './domain-dkim.model'

@Table({
    tableName: 'domains',
    timestamps: true,
})
export class DomainModel extends Model<Domain, DomainCreate> implements Domain {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare domainId: number

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare fqdn: string

    @AllowNull
    @ForeignKey(() => DomainDkimModel)
    @Column(DataType.INTEGER)
    declare activeDkimId: number

    @BelongsTo(() => DomainDkimModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    activeDkim: DomainDkimModel | null = null

    @HasMany(() => DomainDkimModel)
    dkims: DomainDkimModel[] = []

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
