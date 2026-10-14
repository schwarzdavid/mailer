import { ApiProperty } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'
import { MAIL_MESSAGE_PAGE_SIZE_DEFAULT, MAIL_MESSAGE_PAGE_SIZE_MAX } from '../mail.constants.js'

export class MailMessageQueryDto {
    @Expose()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @ApiProperty({ type: Number, required: false, default: 1, minimum: 1 })
    page: number = 1

    @Expose()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(MAIL_MESSAGE_PAGE_SIZE_MAX)
    @ApiProperty({
        type: Number,
        required: false,
        default: MAIL_MESSAGE_PAGE_SIZE_DEFAULT,
        minimum: 1,
        maximum: MAIL_MESSAGE_PAGE_SIZE_MAX,
    })
    itemsPerPage: number = MAIL_MESSAGE_PAGE_SIZE_DEFAULT

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    @ApiProperty({ type: String, required: false })
    search?: string

    @Expose()
    @IsOptional()
    @IsEnum(MailMessageSource)
    @ApiProperty({ enum: MailMessageSource, enumName: 'MailMessageSource', required: false })
    source?: MailMessageSource

    @Expose()
    @IsOptional()
    @IsEnum(MailMessageStatus)
    @ApiProperty({ enum: MailMessageStatus, enumName: 'MailMessageStatus', required: false })
    status?: MailMessageStatus
}
