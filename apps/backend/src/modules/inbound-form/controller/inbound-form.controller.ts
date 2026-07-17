import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Put,
    Query,
    SerializeOptions,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { Principal } from '../../auth/decorators/Principal'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { InboundFormService } from '../services/inbound-form.service'
import { InboundFormTemplateService } from '../services/inbound-form-template.service'
import { InboundFormCreateDto, InboundFormUpdateDto } from '../dtos/inbound-form-create.dto'
import { InboundFormDetailDto, InboundFormDto } from '../dtos/inbound-form.dto'
import { InboundFormFieldDto, InboundFormFieldsPutDto } from '../dtos/inbound-form-field.dto'
import { InboundFormSecurityDto, InboundFormSecurityPutDto } from '../dtos/inbound-form-security.dto'
import {
    InboundFormReceiverCreateDto,
    InboundFormReceiverDto,
    InboundFormReceiverUpdateDto,
} from '../dtos/inbound-form-receiver.dto'
import { InboundFormTemplateDraftDto, InboundFormTemplateDto } from '../dtos/inbound-form-template.dto'
import type { UserWithRole } from '../../user/interfaces/user.interface'
import type { AppAbility } from '../../permission/interfaces/app-ability'

@JwtAuth()
@ApiTags('inbound-form')
@Controller('inbound-form')
export class InboundFormController {
    constructor(
        private readonly inboundFormService: InboundFormService,
        private readonly templateService: InboundFormTemplateService,
    ) {}

    @ResponseDto(InboundFormDto)
    @Post()
    async createInboundForm(
        @Body() body: InboundFormCreateDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<InboundFormDto> {
        const form = await this.inboundFormService.createForm(
            {
                name: body.name,
                slug: body.slug,
                domainId: body.domainId,
                projectId: body.projectId,
            },
            ability,
        )

        return InboundFormDto.fromInboundForm(form)
    }

    @SerializeOptions({ type: InboundFormDto })
    @Get()
    async getInboundForms(
        @Query('projectId', new ParseIntPipe({ optional: true })) projectId: number | undefined,
        @Principal() principal: UserWithRole,
        @CurrentAbility() ability: AppAbility,
    ): Promise<InboundFormDto[]> {
        const forms = await this.inboundFormService.getForms(principal, ability, projectId)

        return forms.map((form) => InboundFormDto.fromInboundForm(form))
    }

    @ResponseDto(InboundFormDetailDto)
    @Get(':inboundFormId')
    async getInboundForm(
        @Param('inboundFormId') inboundFormId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<InboundFormDetailDto> {
        const form = await this.inboundFormService.getFormById(inboundFormId, ability)

        return this.toDetailDto(form)
    }

    @ResponseDto(InboundFormDetailDto)
    @Patch(':inboundFormId')
    async updateInboundForm(
        @Param('inboundFormId') inboundFormId: number,
        @Body() body: InboundFormUpdateDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<InboundFormDetailDto> {
        const form = await this.inboundFormService.updateForm(inboundFormId, body, ability)

        return this.toDetailDto(form)
    }

    @Delete(':inboundFormId')
    async deleteInboundForm(
        @Param('inboundFormId') inboundFormId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.inboundFormService.deleteForm(inboundFormId, ability)
    }

    @SerializeOptions({ type: InboundFormFieldDto })
    @Put(':inboundFormId/fields')
    async updateInboundFormFields(
        @Param('inboundFormId') inboundFormId: number,
        @Body() body: InboundFormFieldsPutDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<InboundFormFieldDto[]> {
        const fields = await this.inboundFormService.replaceFields(inboundFormId, body.fields, ability)

        return fields.map((field) => InboundFormFieldDto.fromField(field))
    }

    @SerializeOptions({ type: InboundFormSecurityDto })
    @Put(':inboundFormId/security')
    async updateInboundFormSecurity(
        @Param('inboundFormId') inboundFormId: number,
        @Body() body: InboundFormSecurityPutDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<InboundFormSecurityDto[]> {
        const security = await this.inboundFormService.replaceSecurity(inboundFormId, body.security, ability)

        return security.map((scheme) => InboundFormSecurityDto.fromSecurity(scheme))
    }

    @ResponseDto(InboundFormReceiverDto)
    @Post(':inboundFormId/receiver')
    async createInboundFormReceiver(
        @Param('inboundFormId') inboundFormId: number,
        @Body() body: InboundFormReceiverCreateDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<InboundFormReceiverDto> {
        const receiver = await this.inboundFormService.createReceiver(
            inboundFormId,
            {
                emailFrom: body.emailFrom,
                emailReceiver: body.emailReceiver,
                emailReplyTo: body.emailReplyTo,
                isActive: body.isActive,
            },
            ability,
        )

        return InboundFormReceiverDto.fromReceiver(receiver)
    }

    @ResponseDto(InboundFormReceiverDto)
    @Patch(':inboundFormId/receiver/:inboundFormReceiverId')
    async updateInboundFormReceiver(
        @Param('inboundFormId') inboundFormId: number,
        @Param('inboundFormReceiverId') inboundFormReceiverId: number,
        @Body() body: InboundFormReceiverUpdateDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<InboundFormReceiverDto> {
        const receiver = await this.inboundFormService.updateReceiver(
            inboundFormId,
            inboundFormReceiverId,
            body,
            ability,
        )
        const summaries = await this.templateService.getVersionSummaries([inboundFormReceiverId])

        return InboundFormReceiverDto.fromReceiver(receiver, summaries[inboundFormReceiverId])
    }

    @Delete(':inboundFormId/receiver/:inboundFormReceiverId')
    async deleteInboundFormReceiver(
        @Param('inboundFormId') inboundFormId: number,
        @Param('inboundFormReceiverId') inboundFormReceiverId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.inboundFormService.deleteReceiver(inboundFormId, inboundFormReceiverId, ability)
    }

    @SerializeOptions({ type: InboundFormTemplateDto })
    @Get(':inboundFormId/receiver/:inboundFormReceiverId/template')
    async getInboundFormTemplates(
        @Param('inboundFormId') inboundFormId: number,
        @Param('inboundFormReceiverId') inboundFormReceiverId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<InboundFormTemplateDto[]> {
        await this.inboundFormService.getReceiver(inboundFormId, inboundFormReceiverId, ability)
        const templates = await this.templateService.listVersions(inboundFormReceiverId)

        return templates.map((template) => InboundFormTemplateDto.fromTemplate(template))
    }

    @ResponseDto(InboundFormTemplateDto)
    @Put(':inboundFormId/receiver/:inboundFormReceiverId/template/draft')
    async saveInboundFormTemplateDraft(
        @Param('inboundFormId') inboundFormId: number,
        @Param('inboundFormReceiverId') inboundFormReceiverId: number,
        @Body() body: InboundFormTemplateDraftDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<InboundFormTemplateDto> {
        await this.inboundFormService.getReceiver(inboundFormId, inboundFormReceiverId, ability, 'update')
        const draft = await this.templateService.saveDraft(inboundFormReceiverId, body)

        return InboundFormTemplateDto.fromTemplate(draft)
    }

    @ResponseDto(InboundFormTemplateDto)
    @Post(':inboundFormId/receiver/:inboundFormReceiverId/template/publish')
    async publishInboundFormTemplate(
        @Param('inboundFormId') inboundFormId: number,
        @Param('inboundFormReceiverId') inboundFormReceiverId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<InboundFormTemplateDto> {
        await this.inboundFormService.getReceiver(inboundFormId, inboundFormReceiverId, ability, 'update')
        const published = await this.templateService.publishDraft(inboundFormReceiverId)

        return InboundFormTemplateDto.fromTemplate(published)
    }

    private async toDetailDto(
        form: Awaited<ReturnType<InboundFormService['getFormById']>>,
    ): Promise<InboundFormDetailDto> {
        const receiverIds = form.inboundFormReceivers.map((receiver) => receiver.inboundFormReceiverId)
        const summaries = await this.templateService.getVersionSummaries(receiverIds)

        return InboundFormDetailDto.fromInboundFormFull(form, summaries)
    }
}
