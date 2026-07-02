import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { DomainModel } from './models/domain.model'
import { DomainDkimModel } from './models/domain-dkim.model'
import { DomainController } from './controller/domain.controller'
import { DomainService } from './services/domain.service'
import { DomainDkimService } from './services/domain-dkim.service'
import { DkimEncryptionService } from './services/dkim-encryption.service'
import { DomainDnsService } from './services/domain-dns.service'

@Module({
    imports: [SequelizeModule.forFeature([DomainModel, DomainDkimModel])],
    controllers: [DomainController],
    providers: [DomainService, DomainDkimService, DkimEncryptionService, DomainDnsService],
})
export class DomainModule {}
