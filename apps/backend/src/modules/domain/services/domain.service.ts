import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { DomainModel } from '../models/domain.model'
import { DomainDkimService } from './domain-dkim.service'
import { DomainCreate, DomainWithDkim } from '../interfaces/domain.interface'

@Injectable()
export class DomainService {
    private readonly logger = new Logger(DomainService.name)

    constructor(
        private readonly domainDkimService: DomainDkimService,
        @InjectModel(DomainModel) private readonly domainModel: typeof DomainModel,
    ) {}

    async createDomain(domainCreate: DomainCreate): Promise<DomainWithDkim> {
        this.logger.log(`Creating domain ${domainCreate.fqdn}`)
        const domainModel = await this.domainModel.create(domainCreate, { returning: true })

        this.logger.log(`Created domain ${domainModel.fqdn}. Creating DKIM`)
        const dkim = await this.domainDkimService.createDkimForDomain(domainModel, true)
        this.logger.log(`Created DKIM for domain ${domainModel.fqdn}`)

        const domain = domainModel.get({ plain: true }) as DomainWithDkim

        domain.activeDkim = dkim
        domain.activeDkimId = dkim.dkimId
        domain.dkims = [dkim]

        return domain
    }
}
