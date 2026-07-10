import { Expose, Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { InboundForm, InboundFormFull } from '../interfaces/inbound-form.interface'
import { InboundFormTemplateSummary } from '../interfaces/inbound-form-template.interface'
import { InboundFormFieldDto } from './inbound-form-field.dto'
import { InboundFormSecurityDto } from './inbound-form-security.dto'
import { InboundFormReceiverDto } from './inbound-form-receiver.dto'

export class InboundFormDto {
    @Expose()
    inboundFormId!: number

    @Expose()
    @ApiProperty({ type: Number, nullable: true })
    domainId: number | null = null

    @Expose()
    name!: string

    @Expose()
    slug!: string

    @Expose()
    @ApiProperty({ type: Boolean })
    isActive!: boolean

    @Expose()
    createdAt!: Date

    static fromInboundForm(form: InboundForm): InboundFormDto {
        return {
            inboundFormId: form.inboundFormId,
            domainId: form.domainId,
            name: form.name,
            slug: form.slug,
            isActive: form.isActive,
            createdAt: form.createdAt,
        }
    }
}

export class InboundFormDetailDto extends InboundFormDto {
    @Expose()
    @Type(() => InboundFormFieldDto)
    fields!: InboundFormFieldDto[]

    @Expose()
    @Type(() => InboundFormSecurityDto)
    security!: InboundFormSecurityDto[]

    @Expose()
    @Type(() => InboundFormReceiverDto)
    receivers!: InboundFormReceiverDto[]

    static fromInboundFormFull(
        form: InboundFormFull,
        summaries: Record<number, InboundFormTemplateSummary>,
    ): InboundFormDetailDto {
        return {
            ...InboundFormDto.fromInboundForm(form),
            fields: form.inboundFormFields.map((field) => InboundFormFieldDto.fromField(field)),
            security: form.inboundFormSecurity.map((scheme) => InboundFormSecurityDto.fromSecurity(scheme)),
            receivers: form.inboundFormReceivers.map((receiver) =>
                InboundFormReceiverDto.fromReceiver(receiver, summaries[receiver.inboundFormReceiverId]),
            ),
        }
    }
}
