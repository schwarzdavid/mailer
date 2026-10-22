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
    MailMessage,
    MailMessageCreate,
    MailMessageSource,
    MailMessageStatus,
} from '../interfaces/mail-message.interface.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { ApiKeyModel } from '../../api-key/models/api-key.model.js'
import type { Relation } from '../../../types/relation.js'

@Table({
    tableName: 'mail_messages',
    indexes: [
        {
            name: 'mail_messages_project_id_mail_message_id',
            fields: ['projectId', 'mailMessageId'],
        },
        {
            name: 'mail_messages_smtp_message_id',
            fields: ['smtpMessageId'],
        },
    ],
})
export class MailMessageModel extends Model<MailMessage, MailMessageCreate> implements MailMessage {
    @PrimaryKey
    @AutoIncrement
    @AllowNull(false)
    @Column(DataType.INTEGER)
    declare mailMessageId: number

    @ForeignKey(() => ProjectModel)
    @AllowNull
    @Column(DataType.INTEGER)
    declare projectId: number | null

    @AllowNull(false)
    @Column(DataType.STRING(32))
    declare source: MailMessageSource

    @ForeignKey(() => ApiKeyModel)
    @AllowNull
    @Column(DataType.INTEGER)
    declare apiKeyId: number | null

    @AllowNull(false)
    @Column(DataType.STRING(320))
    declare emailFrom: string

    @AllowNull(false)
    @Column(DataType.STRING(320))
    declare emailTo: string

    @AllowNull(false)
    @Column(DataType.TEXT)
    declare subject: string

    @AllowNull(false)
    @Column(DataType.STRING(32))
    declare status: MailMessageStatus

    @AllowNull
    @Column(DataType.TEXT)
    declare error: string | null

    @AllowNull
    @Column(DataType.STRING(998))
    declare smtpMessageId: string | null

    @AllowNull
    @Column(DataType.DATE)
    declare sentAt: Date | null

    @CreatedAt
    declare createdAt: Date

    @UpdatedAt
    declare updatedAt: Date

    @BelongsTo(() => ProjectModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    declare project?: Relation<ProjectModel> | null

    @BelongsTo(() => ApiKeyModel, {
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
    })
    declare apiKey?: Relation<ApiKeyModel> | null
}
