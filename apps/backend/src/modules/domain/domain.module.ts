import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { DomainModel } from './models/domain.model'
import { DomainDkimModel } from './models/domain-dkim.model'
import { DomainController } from './controller/domain.controller'
import { DomainService } from './services/domain.service'
import { DomainDkimService } from './services/domain-dkim.service'
import { DkimEncryptionService } from './services/dkim-encryption.service'
import { DomainDnsService } from './services/domain-dns.service'
import { DomainDnsModel } from './models/domain-dns.model'

@Module({
    imports: [SequelizeModule.forFeature([DomainModel, DomainDkimModel, DomainDnsModel])],
    controllers: [DomainController],
    providers: [DomainService, DomainDkimService, DkimEncryptionService, DomainDnsService],
    exports: [DomainService, DkimEncryptionService],
})
export class DomainModule {}
