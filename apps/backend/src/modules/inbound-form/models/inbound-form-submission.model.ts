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
    InboundFormSubmission,
    InboundFormSubmissionCreate,
    InboundFormSubmissionStatus,
} from '../interfaces/inbound-form-submission.interface'
import { InboundFormModel } from './inbound-form.model'

@Table({
    tableName: 'inbound_form_submission',
    updatedAt: false,
})
export class InboundFormSubmissionModel
    extends Model<InboundFormSubmission, InboundFormSubmissionCreate>
    implements InboundFormSubmission
{
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormSubmissionId: number

    @ForeignKey(() => InboundFormModel)
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare inboundFormId: number

    @AllowNull(false)
    @Column(DataType.JSONB)
    declare data: Record<string, unknown>

    @AllowNull(false)
    @Column(DataType.STRING(255))
    declare status: InboundFormSubmissionStatus

    @CreatedAt
    declare createdAt: Date

    @BelongsTo(() => InboundFormModel, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    inboundForm: InboundFormModel | null = null
}
