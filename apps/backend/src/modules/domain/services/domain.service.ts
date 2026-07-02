import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { DomainModel } from '../models/domain.model'
import { DomainDkimService } from './domain-dkim.service'
import { DomainCreate, DomainWithDkim } from '../interfaces/domain.interface'

@Injectable()
export class DomainService {
    constructor(
        private readonly domainDkimService: DomainDkimService,
        @InjectModel(DomainModel) private readonly domainModel: typeof DomainModel,
    ) {}

    async createDomain(domainCreate: DomainCreate): Promise<DomainWithDkim> {
        const domainModel = await this.domainModel.create(domainCreate, { returning: true })
        const dkim = await this.domainDkimService.createDkimForDomain(domainModel, true)
        const domain = domainModel.get({ plain: true }) as DomainWithDkim

        domain.activeDkim = dkim
        domain.activeDkimId = dkim.dkimId
        domain.dkims = [dkim]

        return domain
    }
}
