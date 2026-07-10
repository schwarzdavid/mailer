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
    Unique,
    UpdatedAt,
} from 'sequelize-typescript'
import {
    InboundFormTemplate,
    InboundFormTemplateCreate,
    InboundFormTemplateStatus,
} from '../interfaces/inbound-form-template.interface'
import { InboundFormReceiverModel } from './inbound-form-receiver.model'

@Table({
    tableName: 'inbound_form_template',
})
export class InboundFormTemplateModel
    extends Model<InboundFormTemplate, InboundFormTemplateCreate>
    implements InboundFormTemplate
{
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormTemplateId: number

    @Unique('template_version')
    @ForeignKey(() => InboundFormReceiverModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormReceiverId: number

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare subject: string

    @AllowNull(false)
    @Column(DataType.TEXT)
    declare template: string

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare status: InboundFormTemplateStatus

    @Unique('template_version')
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare version: number

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date

    @BelongsTo(() => InboundFormReceiverModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    declare receiver: InboundFormReceiverModel | null
}
