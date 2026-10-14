import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { MailMessage, MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'

export class MailMessageDto implements Omit<MailMessage, 'projectId' | 'smtpMessageId' | 'updatedAt'> {
    @Expose()
    mailMessageId!: number

    @Expose()
    @ApiProperty({ enum: MailMessageSource, enumName: 'MailMessageSource' })
    source!: MailMessageSource

    @Expose()
    @ApiProperty({ type: Number, nullable: true })
    apiKeyId: number | null = null

    @Expose()
    emailFrom!: string

    @Expose()
    emailTo!: string

    @Expose()
    subject!: string

    @Expose()
    @ApiProperty({ enum: MailMessageStatus, enumName: 'MailMessageStatus' })
    status!: MailMessageStatus

    @Expose()
    @ApiProperty({ type: String, nullable: true })
    error: string | null = null

    @Expose()
    @ApiProperty({ type: Date, nullable: true })
    sentAt: Date | null = null

    @Expose()
    createdAt!: Date

    static fromMailMessage(message: MailMessage): MailMessageDto {
        return {
            mailMessageId: message.mailMessageId,
            source: message.source,
            apiKeyId: message.apiKeyId,
            emailFrom: message.emailFrom,
            emailTo: message.emailTo,
            subject: message.subject,
            status: message.status,
            error: message.error,
            sentAt: message.sentAt,
            createdAt: message.createdAt,
        }
    }
}
