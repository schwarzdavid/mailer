import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { DomainModel } from '../models/domain.model';
import { DomainDkimService } from './domain-dkim.service';
import { DomainCreate } from '../interfaces/domain.interface';
import { DomainDto } from '../dtos/domain.dto';

@Injectable()
export class DomainService {
    constructor(
        private readonly domainDkimService: DomainDkimService,
        @InjectModel(DomainModel) private readonly domainModel: typeof DomainModel,
    ) {
    }

    async createDomain(domainCreate: DomainCreate): Promise<DomainDto> {
        const domain = await this.domainModel.create(domainCreate, {returning: true});
        await this.domainDkimService.createDkimForDomain(domain, true)

        return domain.get({plain: true});
    }
}
