import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    CreatedAt,
    DataType,
    Default,
    ForeignKey,
    HasMany,
    Model,
    PrimaryKey,
    Table,
    Unique,
    UpdatedAt,
} from 'sequelize-typescript'
import { InboundForm, InboundFormCreate, InboundFormFull } from '../interfaces/inbound-form.interface'
import { DomainModel } from '../../domain/models/domain.model'
import { InboundFormFieldModel } from './inbound-form-field.model'
import { InboundFormReceiverModel } from './inbound-form-receiver.model'
import { InboundFormSecurityModel } from './inbound-form-security.model'

@Table({
    tableName: 'inbound_form',
    timestamps: true,
})
export class InboundFormModel extends Model<InboundForm, InboundFormCreate> implements InboundFormFull {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormId: number

    @ForeignKey(() => DomainModel)
    @AllowNull
    @Column(DataType.INTEGER)
    declare domainId: number

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare name: string

    @Unique
    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare slug: string

    @Default(true)
    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    declare isActive: boolean

    @BelongsTo(() => DomainModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    domain: DomainModel | null = null

    @HasMany(() => InboundFormFieldModel)
    declare inboundFormFields: InboundFormFieldModel[]

    @HasMany(() => InboundFormReceiverModel)
    declare inboundFormReceivers: InboundFormReceiverModel[]

    @HasMany(() => InboundFormSecurityModel)
    declare inboundFormSecurity: InboundFormSecurityModel[]

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date
}
