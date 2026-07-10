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
import { InboundFormReceiver, InboundFormReceiverCreate } from '../interfaces/inbound-form-receiver.interface'
import { InboundFormModel } from './inbound-form.model'

@Table({
    tableName: 'inbound_form_receiver',
})
export class InboundFormReceiverModel
    extends Model<InboundFormReceiver, InboundFormReceiverCreate>
    implements InboundFormReceiver
{
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormReceiverId: number

    @ForeignKey(() => InboundFormModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormId: number

    @AllowNull(false)
    @Column(DataType.STRING)
    declare emailReceiver: string

    @AllowNull(false)
    @Column(DataType.STRING)
    declare emailFrom: string

    @AllowNull(false)
    @Column(DataType.BOOLEAN)
    declare isActive: boolean

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
