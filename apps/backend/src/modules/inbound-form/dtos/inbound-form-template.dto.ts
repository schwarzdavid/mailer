import { Expose } from 'class-transformer'
import { IsString, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { InboundFormTemplate, InboundFormTemplateStatus } from '../interfaces/inbound-form-template.interface'

export class InboundFormTemplateDraftDto {
    @Expose()
    @IsString()
    @MaxLength(255)
    subject!: string

    @Expose()
    @IsString()
    template!: string
}

export class InboundFormTemplateDto {
    @Expose()
    inboundFormTemplateId!: number

    @Expose()
    inboundFormReceiverId!: number

    @Expose()
    subject!: string

    @Expose()
    template!: string

    @Expose()
    @ApiProperty({ enum: InboundFormTemplateStatus })
    status!: InboundFormTemplateStatus

    @Expose()
    version!: number

    @Expose()
    updatedAt!: Date

    static fromTemplate(template: InboundFormTemplate): InboundFormTemplateDto {
        return {
            inboundFormTemplateId: template.inboundFormTemplateId,
            inboundFormReceiverId: template.inboundFormReceiverId,
            subject: template.subject,
            template: template.template,
            status: template.status,
            version: template.version,
            updatedAt: template.updatedAt,
        }
    }
}
