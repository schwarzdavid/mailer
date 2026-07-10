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
    InboundFormDelivery,
    InboundFormDeliveryCreate,
    InboundFormDeliveryStatus,
} from '../interfaces/inbound-form-delivery.interface'
import { InboundFormSubmissionModel } from './inbound-form-submission.model'
import { InboundFormReceiverModel } from './inbound-form-receiver.model'
import { InboundFormTemplateModel } from './inbound-form-template.model'

@Table({
    tableName: 'inbound_form_delivery',
})
export class InboundFormDeliveryModel
    extends Model<InboundFormDelivery, InboundFormDeliveryCreate>
    implements InboundFormDelivery
{
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormDeliveryId: number

    @ForeignKey(() => InboundFormSubmissionModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormSubmissionId: number

    @ForeignKey(() => InboundFormReceiverModel)
    @AllowNull
    @Column(DataType.INTEGER)
    declare inboundFormReceiverId: number | null

    @ForeignKey(() => InboundFormTemplateModel)
    @AllowNull
    @Column(DataType.INTEGER)
    declare inboundFormTemplateId: number | null

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare emailFrom: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare emailTo: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare status: InboundFormDeliveryStatus

    @AllowNull
    @Column(DataType.TEXT)
    declare error: string | null

    @AllowNull
    @Column(DataType.DATE)
    declare sentAt: Date | null

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date

    @BelongsTo(() => InboundFormSubmissionModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    submission: InboundFormSubmissionModel | null = null

    @BelongsTo(() => InboundFormReceiverModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    receiver: InboundFormReceiverModel | null = null

    @BelongsTo(() => InboundFormTemplateModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    template: InboundFormTemplateModel | null = null
}
