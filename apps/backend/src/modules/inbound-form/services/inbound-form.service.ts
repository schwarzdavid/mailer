import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { Op, UniqueConstraintError } from 'sequelize'
import { InboundFormModel } from '../models/inbound-form.model'
import { InboundFormFieldModel } from '../models/inbound-form-field.model'
import { InboundFormSecurityModel } from '../models/inbound-form-security.model'
import { InboundFormReceiverModel } from '../models/inbound-form-receiver.model'
import { DomainService } from '../../domain/services/domain.service'
import { Domain } from '../../domain/interfaces/domain.interface'
import { ProjectService } from '../../project/services/project.service'
import { InboundForm, InboundFormFull } from '../interfaces/inbound-form.interface'
import {
    InboundFormField,
    InboundFormFieldType,
    InboundFormFieldUpsert,
} from '../interfaces/inbound-form-field.interface'
import {
    InboundFormSecurity,
    InboundFormSecurityType,
    InboundFormSecurityUpsert,
} from '../interfaces/inbound-form-security.interface'
import { InboundFormReceiver, InboundFormReceiverUpsert } from '../interfaces/inbound-form-receiver.interface'
import { parsePlaceholder } from '../helpers/placeholder'
import { AbilityFactory } from '../../permission/services/ability-factory.service'
import { assertProjectReadable, assertProjectUpdatable } from '../../permission/helpers/project-access'
import { AppAbility } from '../../permission/interfaces/app-ability'
import { User } from '../../user/interfaces/user.interface'

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export interface InboundFormCreateRequest {
    name: string
    slug: string
    domainId: number | null
    projectId: number
}

export type InboundFormUpdateRequest = Partial<InboundFormCreateRequest & { isActive: boolean }>

@Injectable()
export class InboundFormService {
    constructor(
        @InjectModel(InboundFormModel) private readonly formModel: typeof InboundFormModel,
        @InjectModel(InboundFormFieldModel) private readonly fieldModel: typeof InboundFormFieldModel,
        @InjectModel(InboundFormSecurityModel) private readonly securityModel: typeof InboundFormSecurityModel,
        @InjectModel(InboundFormReceiverModel) private readonly receiverModel: typeof InboundFormReceiverModel,
        private readonly domainService: DomainService,
        private readonly projectService: ProjectService,
        private readonly abilityFactory: AbilityFactory,
        private readonly sequelize: Sequelize,
    ) {}

    async createForm(create: InboundFormCreateRequest, ability: AppAbility): Promise<InboundForm> {
        await this.assertProjectExists(create.projectId)
        assertProjectUpdatable(ability, create.projectId)

        if (create.domainId !== null) {
            await this.assertDomainExists(create.domainId)
            await this.projectService.assertDomainInProject(create.projectId, create.domainId)
        }

        try {
            const created = await this.formModel.create({ ...create, isActive: true }, { returning: true })
            return created.get({ plain: true })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Slug is already in use')
            }
            throw error
        }
    }

    async getForms(principal: User, ability: AppAbility, projectId?: number): Promise<InboundForm[]> {
        let query: { where: { projectId: number | { [Op.in]: number[] } } } | undefined

        if (projectId !== undefined) {
            assertProjectReadable(ability, projectId)
            query = { where: { projectId } }
        } else {
            const scope = await this.abilityFactory.getProjectIdsFor(principal, 'read')
            query = scope === 'all' ? undefined : { where: { projectId: { [Op.in]: scope } } }
        }

        const forms = await this.formModel.findAll(query)

        return forms.map((form) => form.get({ plain: true }))
    }

    async getFormById(inboundFormId: number, ability: AppAbility): Promise<InboundFormFull> {
        const form = await this.loadFormChecked(inboundFormId, ability, 'read')

        return form.get({ plain: true }) as InboundFormFull
    }

    async updateForm(
        inboundFormId: number,
        update: InboundFormUpdateRequest,
        ability: AppAbility,
    ): Promise<InboundFormFull> {
        const form = await this.loadFormChecked(inboundFormId, ability, 'update')

        if (update.domainId !== undefined && update.domainId !== form.domainId) {
            if (update.domainId === null) {
                if (form.inboundFormReceivers.length > 0) {
                    throw new BadRequestException('The domain cannot be removed while receivers exist')
                }
            } else {
                const domain = await this.assertDomainExists(update.domainId)
                await this.projectService.assertDomainInProject(form.projectId, update.domainId)
                for (const receiver of form.inboundFormReceivers) {
                    this.assertEmailFrom(receiver.emailFrom, domain)
                }
            }
        }

        try {
            await form.update(update)
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Slug is already in use')
            }
            throw error
        }

        return this.getFormById(inboundFormId, ability)
    }

    async deleteForm(inboundFormId: number, ability: AppAbility): Promise<void> {
        const form = await this.loadFormChecked(inboundFormId, ability, 'update')

        await form.destroy()
    }

    async replaceFields(
        inboundFormId: number,
        fields: InboundFormFieldUpsert[],
        ability: AppAbility,
    ): Promise<InboundFormField[]> {
        const form = await this.loadFormChecked(inboundFormId, ability, 'update')

        const keys = fields.map((field) => field.key)
        if (new Set(keys).size !== keys.length) {
            throw new BadRequestException('Field keys must be unique')
        }

        for (const field of fields) {
            this.assertValidPattern(field)
        }

        const fieldsByKey = new Map(fields.map((field) => [field.key, field]))
        for (const receiver of form.inboundFormReceivers) {
            for (const value of [receiver.emailReceiver, receiver.emailReplyTo]) {
                if (value === null) {
                    continue
                }
                const referencedKey = parsePlaceholder(value)
                if (referencedKey === null) {
                    continue
                }
                const referenced = fieldsByKey.get(referencedKey)
                if (!referenced || referenced.type !== InboundFormFieldType.EMAIL) {
                    throw new BadRequestException(
                        `Field "${referencedKey}" is referenced by a receiver and must stay an email field`,
                    )
                }
            }
        }

        const existingKeys = new Set(form.inboundFormFields.map((field) => field.key))

        await this.sequelize.transaction(async (transaction) => {
            await this.fieldModel.destroy({
                where: { inboundFormId, key: { [Op.notIn]: keys } },
                transaction,
            })

            for (const field of fields) {
                if (existingKeys.has(field.key)) {
                    await this.fieldModel.update(
                        {
                            label: field.label,
                            type: field.type,
                            defaultValue: field.defaultValue,
                            validation: field.validation,
                        },
                        { where: { inboundFormId, key: field.key }, transaction },
                    )
                } else {
                    await this.fieldModel.create({ ...field, inboundFormId }, { transaction })
                }
            }
        })

        const result = await this.fieldModel.findAll({
            where: { inboundFormId },
            order: [['inboundFormFieldId', 'ASC']],
        })

        return result.map((field) => field.get({ plain: true }))
    }

    async replaceSecurity(
        inboundFormId: number,
        schemes: InboundFormSecurityUpsert[],
        ability: AppAbility,
    ): Promise<InboundFormSecurity[]> {
        await this.loadFormChecked(inboundFormId, ability, 'update')

        const types = schemes.map((scheme) => scheme.type)
        if (new Set(types).size !== types.length) {
            throw new BadRequestException('Only one scheme per type is allowed')
        }

        for (const scheme of schemes) {
            if (scheme.type === InboundFormSecurityType.CSRF) {
                throw new BadRequestException('The csrf scheme is not supported yet')
            }
            if (scheme.type === InboundFormSecurityType.RECAPTCHA && !scheme.config?.secret) {
                throw new BadRequestException('Recaptcha requires a secret')
            }
        }

        const created = await this.sequelize.transaction(async (transaction) => {
            await this.securityModel.destroy({ where: { inboundFormId }, transaction })

            return this.securityModel.bulkCreate(
                schemes.map((scheme) => ({ ...scheme, inboundFormId })),
                { transaction, returning: true },
            )
        })

        return created.map((scheme) => scheme.get({ plain: true }))
    }

    async createReceiver(
        inboundFormId: number,
        create: InboundFormReceiverUpsert,
        ability: AppAbility,
    ): Promise<InboundFormReceiver> {
        const form = await this.loadFormChecked(inboundFormId, ability, 'update')
        await this.assertReceiverValid(form, create)

        const created = await this.receiverModel.create({ ...create, inboundFormId }, { returning: true })

        return created.get({ plain: true })
    }

    async updateReceiver(
        inboundFormId: number,
        inboundFormReceiverId: number,
        update: Partial<InboundFormReceiverUpsert>,
        ability: AppAbility,
    ): Promise<InboundFormReceiver> {
        const form = await this.loadFormChecked(inboundFormId, ability, 'update')
        const receiver = await this.loadReceiver(inboundFormId, inboundFormReceiverId)

        await this.assertReceiverValid(form, { ...receiver.get({ plain: true }), ...update })
        await receiver.update(update)

        return receiver.get({ plain: true })
    }

    async deleteReceiver(inboundFormId: number, inboundFormReceiverId: number, ability: AppAbility): Promise<void> {
        await this.loadFormChecked(inboundFormId, ability, 'update')
        const receiver = await this.loadReceiver(inboundFormId, inboundFormReceiverId)

        await receiver.destroy()
    }

    async getReceiver(
        inboundFormId: number,
        inboundFormReceiverId: number,
        ability: AppAbility,
        permission: 'read' | 'update' = 'read',
    ): Promise<InboundFormReceiver> {
        await this.loadFormChecked(inboundFormId, ability, permission)
        const receiver = await this.loadReceiver(inboundFormId, inboundFormReceiverId)

        return receiver.get({ plain: true })
    }

    private async loadForm(inboundFormId: number): Promise<InboundFormModel> {
        const form = await this.formModel.findByPk(inboundFormId, {
            include: [InboundFormFieldModel, InboundFormSecurityModel, InboundFormReceiverModel],
        })

        if (!form) {
            throw new NotFoundException('Unknown form')
        }

        return form
    }

    private async loadFormChecked(
        inboundFormId: number,
        ability: AppAbility,
        permission: 'read' | 'update',
    ): Promise<InboundFormModel> {
        const form = await this.loadForm(inboundFormId)
        if (permission === 'read') {
            assertProjectReadable(ability, form.projectId)
        } else {
            assertProjectUpdatable(ability, form.projectId)
        }

        return form
    }

    private async loadReceiver(
        inboundFormId: number,
        inboundFormReceiverId: number,
    ): Promise<InboundFormReceiverModel> {
        const receiver = await this.receiverModel.findOne({
            where: { inboundFormId, inboundFormReceiverId },
        })

        if (!receiver) {
            throw new NotFoundException('Unknown receiver')
        }

        return receiver
    }

    private async assertDomainExists(domainId: number): Promise<Domain> {
        try {
            return await this.domainService.getDomainById(domainId)
        } catch {
            throw new BadRequestException('Unknown domain')
        }
    }

    private async assertProjectExists(projectId: number): Promise<void> {
        try {
            await this.projectService.assertProjectExists(projectId)
        } catch {
            throw new BadRequestException('Unknown project')
        }
    }

    private assertEmailFrom(emailFrom: string, domain: Domain): void {
        if (!EMAIL_PATTERN.test(emailFrom)) {
            throw new BadRequestException(`"${emailFrom}" is not a valid sender address`)
        }
        if (!emailFrom.toLowerCase().endsWith(`@${domain.fqdn.toLowerCase()}`)) {
            throw new BadRequestException(`Sender address must use the form domain ${domain.fqdn}`)
        }
    }

    private assertValidPattern(field: InboundFormFieldUpsert): void {
        const pattern = field.validation?.pattern
        if (pattern === undefined) {
            return
        }
        try {
            new RegExp(pattern)
        } catch {
            throw new BadRequestException(`Invalid pattern for field "${field.key}"`)
        }
    }

    private async assertReceiverValid(form: InboundFormModel, receiver: InboundFormReceiverUpsert): Promise<void> {
        if (form.domainId === null) {
            throw new BadRequestException('The form needs a domain before receivers can be configured')
        }

        const domain = await this.assertDomainExists(form.domainId)
        this.assertEmailFrom(receiver.emailFrom, domain)

        this.assertRecipient(form, receiver.emailReceiver)
        if (receiver.emailReplyTo !== null) {
            this.assertRecipient(form, receiver.emailReplyTo)
        }
    }

    private assertRecipient(form: InboundFormModel, value: string): void {
        const referencedKey = parsePlaceholder(value)

        if (referencedKey === null) {
            if (!EMAIL_PATTERN.test(value)) {
                throw new BadRequestException(`"${value}" is neither an email address nor a field placeholder`)
            }
            return
        }

        const field = form.inboundFormFields.find((formField) => formField.key === referencedKey)
        if (!field || field.type !== InboundFormFieldType.EMAIL) {
            throw new BadRequestException(`Placeholder "${value}" must reference an email field of this form`)
        }
    }
}
