import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { DomainModel } from './models/domain.model.js'
import { DomainDkimModel } from './models/domain-dkim.model.js'
import { DomainController } from './controller/domain.controller.js'
import { DomainService } from './services/domain.service.js'
import { DomainDkimService } from './services/domain-dkim.service.js'
import { EncryptionModule } from '../encryption/encryption.module.js'
import { DomainDnsService } from './services/domain-dns.service.js'
import { DnsHealthService } from './services/dns-health.service.js'
import { DomainDnsModel } from './models/domain-dns.model.js'
import { SettingsModel } from '../settings/models/settings.model.js'
import { InboundFormModel } from '../inbound-form/models/inbound-form.model.js'
import { ProjectModel } from '../project/models/project.model.js'
import { ProjectDomainModel } from '../project/models/project-domain.model.js'

@Module({
    imports: [
        SequelizeModule.forFeature([
            DomainModel,
            DomainDkimModel,
            DomainDnsModel,
            SettingsModel,
            InboundFormModel,
            ProjectModel,
            ProjectDomainModel,
        ]),
        EncryptionModule,
    ],
    controllers: [DomainController],
    providers: [DomainService, DomainDkimService, DomainDnsService, DnsHealthService],
    exports: [DomainService, DomainDnsService],
})
export class DomainModule {}
