import {
    AllowNull,
    AutoIncrement, BelongsTo,
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
    InboundFormSecurity,
    InboundFormSecurityCreate,
    InboundFormSecurityLocation,
    InboundFormSecurityType,
} from '../interfaces/inbound-form-security.interface'
import { InboundFormModel } from './inbound-form.model'

@Table({
    tableName: 'inbound_form_security',
})
export class InboundFormSecurityModel
    extends Model<InboundFormSecurity, InboundFormSecurityCreate>
    implements InboundFormSecurity
{
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormId: number

    @ForeignKey(() => InboundFormModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormSecurityId: number

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare location: InboundFormSecurityLocation

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare key: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare type: InboundFormSecurityType

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date

    @BelongsTo(() => InboundFormModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    inboundForm: InboundFormModel | null = null
}
