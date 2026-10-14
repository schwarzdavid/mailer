import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator'

export const MAX_BODY_LENGTH = 1_000_000

export class PublicSendDto {
    @Expose()
    @IsEmail()
    from!: string

    @Expose()
    @IsEmail()
    to!: string

    @Expose()
    @IsOptional()
    @IsEmail()
    replyTo?: string

    @Expose()
    @IsString()
    @Length(1, 998)
    subject!: string

    @Expose()
    @IsString()
    @Length(1, MAX_BODY_LENGTH)
    html!: string

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(MAX_BODY_LENGTH)
    text?: string
}

export class PublicSendResultDto {
    @Expose()
    mailMessageId!: number

    @Expose()
    @ApiProperty({ enum: ['sent'] })
    status!: 'sent'
}
