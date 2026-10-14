import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { ApiKeyController } from './controller/api-key.controller.js'
import { PublicSendController } from './controller/public-send.controller.js'
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard.js'
import { ApiKeyModel } from './models/api-key.model.js'
import { ApiKeyService } from './services/api-key.service.js'
import { PublicSendService } from './services/public-send.service.js'
import { DomainModule } from '../domain/domain.module.js'
import { ProjectModule } from '../project/project.module.js'
import { MailModule } from '../mail/mail.module.js'

@Module({
    imports: [SequelizeModule.forFeature([ApiKeyModel]), DomainModule, ProjectModule, MailModule],
    controllers: [ApiKeyController, PublicSendController],
    providers: [ApiKeyService, ApiKeyAuthGuard, PublicSendService],
    exports: [ApiKeyService],
})
export class ApiKeyModule {}
