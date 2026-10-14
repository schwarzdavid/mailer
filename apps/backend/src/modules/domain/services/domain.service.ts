import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Op, UniqueConstraintError } from 'sequelize'
import { DomainModel } from '../models/domain.model.js'
import { DomainDkimService } from './domain-dkim.service.js'
import { Domain, DomainWithActiveDkim, DomainWithDkim, SendingDomainIps } from '../interfaces/domain.interface.js'
import { DomainDnsService } from './domain-dns.service.js'
import { DomainDkimModel } from '../models/domain-dkim.model.js'
import { SettingsModel } from '../../settings/models/settings.model.js'
import { InboundFormModel } from '../../inbound-form/models/inbound-form.model.js'
import { parse } from 'tldts'

@Injectable()
export class DomainService {
    private readonly logger = new Logger(DomainService.name)

    constructor(
        private readonly domainDkimService: DomainDkimService,
        private readonly domainDnsService: DomainDnsService,
        @InjectModel(DomainModel) private readonly domainModel: typeof DomainModel,
        @InjectModel(SettingsModel) private readonly settingsModel: typeof SettingsModel,
        @InjectModel(InboundFormModel) private readonly inboundFormModel: typeof InboundFormModel,
    ) {}

    async createDomain(fqdn: string): Promise<DomainWithDkim> {
        const { domain: rootDomain } = parse(fqdn)
        if (!rootDomain) {
            throw new BadRequestException('Invalid domain.')
        }
        const settings = await this.settingsModel.findOne()
        if (!settings?.sendingDomainId) {
            throw new BadRequestException('No sending domain configured.')
        }
        const domainModel = await this.insertDomain(fqdn, rootDomain)
        this.logger.log(`Created domain ${domainModel.fqdn}`)

        return this.provisionOrRemove(domainModel, async () => {
            const dkim = await this.domainDkimService.createDkimForDomain(domainModel, true)
            this.logger.log(`Created DKIM for domain ${domainModel.fqdn}`)

            const dnsRecords = await this.domainDnsService.createDefaultDnsRecords(domainModel, dkim)
            this.logger.log(`Created DNS records for domain ${domainModel.fqdn}`)

            const domain = domainModel.get({ plain: true }) as DomainWithDkim

            domain.activeDkim = dkim
            domain.activeDkimId = dkim.dkimId
            domain.dkims = [dkim]
            domain.dnsRecords = dnsRecords

            return domain
        })
    }

    async createSendingDomain(fqdn: string, ips: SendingDomainIps): Promise<Domain> {
        const { domain: rootDomain } = parse(fqdn)
        if (!rootDomain) {
            throw new BadRequestException('Invalid domain.')
        }
        const domainModel = await this.insertDomain(fqdn, rootDomain)
        this.logger.log(`Created sending domain ${domainModel.fqdn}`)

        return this.provisionOrRemove(domainModel, async () => {
            const dkim = await this.domainDkimService.createDkimForDomain(domainModel, true)
            const dnsRecords = await this.domainDnsService.createSendingDomainDnsRecords(domainModel, dkim, ips)

            const domain = domainModel.get({ plain: true })
            domain.activeDkimId = dkim.dkimId
            domain.dnsRecords = dnsRecords

            return domain
        })
    }

    async recreateSendingDomainRecords(fqdn: string, ips: SendingDomainIps): Promise<Domain> {
        const domain = await this.getSendingDomainByFqdn(fqdn)
        if (!domain) {
            throw new BadRequestException(`No sending domain found for ${fqdn}`)
        }

        await this.domainDnsService.deleteRecordsForDomain(domain.domainId)
        domain.dnsRecords = await this.domainDnsService.createSendingDomainDnsRecords(domain, domain.activeDkim, ips)

        return domain
    }

    async getDomains(): Promise<Domain[]> {
        const settings = await this.settingsModel.findOne()
        const domains = await this.domainModel.findAll(
            settings?.sendingDomainId ? { where: { domainId: { [Op.ne]: settings.sendingDomainId } } } : undefined,
        )

        return domains.map((domain) => domain.get({ plain: true }))
    }

    async getDomainById(domainId: number): Promise<Domain> {
        const domain = await this.domainModel.findByPk(domainId)
        if (!domain) {
            throw new NotFoundException('Unknown domain')
        }

        return domain.get({ plain: true })
    }

    async getConfiguredSendingDomain(): Promise<Domain | null> {
        const settings = await this.settingsModel.findOne()
        if (!settings?.sendingDomainId) {
            return null
        }
        const domain = await this.domainModel.findByPk(settings.sendingDomainId)

        return domain ? domain.get({ plain: true }) : null
    }

    async deleteDomain(domainId: number): Promise<void> {
        await this.domainModel.destroy({ where: { domainId } })
    }

    async deleteUnusedDomain(domainId: number): Promise<void> {
        const domain = await this.getDomainById(domainId)

        const settings = await this.settingsModel.findOne()
        if (settings?.sendingDomainId === domainId) {
            throw new ConflictException('The sending domain cannot be deleted')
        }

        const formCount = await this.inboundFormModel.count({ where: { domainId } })
        if (formCount > 0) {
            throw new ConflictException('The domain is still used by inbound forms')
        }

        await this.deleteDomain(domainId)
        this.logger.log(`Deleted domain ${domain.fqdn}`)
    }

    private async insertDomain(fqdn: string, rootDomain: string): Promise<DomainModel> {
        try {
            return await this.domainModel.create({ fqdn, rootDomain }, { returning: true })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new ConflictException(`A domain for ${rootDomain} already exists`)
            }
            throw error
        }
    }

    private async provisionOrRemove<T>(domainModel: DomainModel, provision: () => Promise<T>): Promise<T> {
        try {
            return await provision()
        } catch (error) {
            await this.deleteDomain(domainModel.domainId)
            this.logger.warn(`Removed domain ${domainModel.fqdn} after failed provisioning`)
            throw error
        }
    }

    async getSendingDomainByFqdn(fqdn: string): Promise<DomainWithActiveDkim | null> {
        const domain = await this.domainModel.findOne({
            where: { fqdn },
            include: [{ model: DomainDkimModel, as: 'activeDkim' }],
        })

        if (!domain) {
            return null
        }

        // The class-field initializer on DomainModel.activeDkim shadows the
        // association accessor, so the eager-loaded value is only reliably
        // present on the plain representation.
        const sendingDomain = domain.get({ plain: true }) as DomainWithActiveDkim
        if (!sendingDomain.activeDkim) {
            return null
        }

        return sendingDomain
    }
}
