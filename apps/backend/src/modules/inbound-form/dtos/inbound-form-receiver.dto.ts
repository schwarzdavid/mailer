import { Expose } from 'class-transformer'
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { InboundFormReceiver } from '../interfaces/inbound-form-receiver.interface'
import { InboundFormTemplateSummary } from '../interfaces/inbound-form-template.interface'

export class InboundFormReceiverCreateDto {
    @Expose()
    @IsEmail()
    @MaxLength(255)
    emailFrom!: string

    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    emailReceiver!: string

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    emailReplyTo: string | null = null

    @Expose()
    @ApiProperty({ type: Boolean, required: false })
    @IsOptional()
    @IsBoolean()
    isActive: boolean = true
}

export class InboundFormReceiverUpdateDto {
    @Expose()
    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    emailFrom?: string

    @Expose()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    emailReceiver?: string

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    emailReplyTo?: string | null

    @Expose()
    @ApiProperty({ type: Boolean, required: false })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class InboundFormReceiverDto {
    @Expose()
    inboundFormReceiverId!: number

    @Expose()
    emailFrom!: string

    @Expose()
    emailReceiver!: string

    @Expose()
    emailReplyTo: string | null = null

    @Expose()
    @ApiProperty({ type: Boolean })
    isActive!: boolean

    @Expose()
    @ApiProperty({ type: Number, nullable: true })
    draftVersion: number | null = null

    @Expose()
    @ApiProperty({ type: Number, nullable: true })
    publishedVersion: number | null = null

    static fromReceiver(
        receiver: InboundFormReceiver,
        summary: InboundFormTemplateSummary = { draftVersion: null, publishedVersion: null },
    ): InboundFormReceiverDto {
        return {
            inboundFormReceiverId: receiver.inboundFormReceiverId,
            emailFrom: receiver.emailFrom,
            emailReceiver: receiver.emailReceiver,
            emailReplyTo: receiver.emailReplyTo,
            isActive: receiver.isActive,
            draftVersion: summary.draftVersion,
            publishedVersion: summary.publishedVersion,
        }
    }
}
