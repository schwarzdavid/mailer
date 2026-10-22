import {
    AllowNull,
    AutoIncrement,
    BelongsTo,
    Column,
    CreatedAt,
    DataType,
    Default,
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
} from '../interfaces/inbound-form-delivery.interface.js'
import { InboundFormSubmissionModel } from './inbound-form-submission.model.js'
import { InboundFormReceiverModel } from './inbound-form-receiver.model.js'
import { InboundFormTemplateModel } from './inbound-form-template.model.js'
import { MailMessageModel } from '../../mail/models/mail-message.model.js'
import type { Relation } from '../../../types/relation.js'

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

    @Default(0)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare attempts: number

    @AllowNull
    @Column(DataType.TEXT)
    declare error: string | null

    @AllowNull
    @Column(DataType.DATE)
    declare sentAt: Date | null

    @ForeignKey(() => MailMessageModel)
    @AllowNull
    @Column(DataType.INTEGER)
    declare mailMessageId: number | null

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date

    @BelongsTo(() => InboundFormSubmissionModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    declare submission?: Relation<InboundFormSubmissionModel>

    @BelongsTo(() => InboundFormReceiverModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    declare receiver?: Relation<InboundFormReceiverModel> | null

    @BelongsTo(() => InboundFormTemplateModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    declare template?: Relation<InboundFormTemplateModel> | null

    @BelongsTo(() => MailMessageModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    declare mailMessage?: Relation<MailMessageModel> | null
}
