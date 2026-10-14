import { ApiProperty } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { MailMessagePage } from '../interfaces/mail-message.interface.js'
import { MailMessageDto } from './mail-message.dto.js'

export class MailMessagePageDto {
    @Expose()
    @Type(() => MailMessageDto)
    @ApiProperty({ type: [MailMessageDto] })
    items!: MailMessageDto[]

    @Expose()
    @ApiProperty({ type: Number })
    total!: number

    static fromMailMessagePage(page: MailMessagePage): MailMessagePageDto {
        return {
            items: page.items.map((message) => MailMessageDto.fromMailMessage(message)),
            total: page.total,
        }
    }
}
