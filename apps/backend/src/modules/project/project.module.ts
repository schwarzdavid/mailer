import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { ProjectModel } from './models/project.model.js'
import { ProjectDomainModel } from './models/project-domain.model.js'
import { InboundFormModel } from '../inbound-form/models/inbound-form.model.js'
import { DomainModule } from '../domain/domain.module.js'
import { ProjectService } from './services/project.service.js'
import { ProjectPurgeService } from './services/project-purge.service.js'
import { ProjectController } from './controller/project.controller.js'

@Module({
    imports: [SequelizeModule.forFeature([ProjectModel, ProjectDomainModel, InboundFormModel]), DomainModule],
    controllers: [ProjectController],
    providers: [ProjectService, ProjectPurgeService],
    exports: [ProjectService],
})
export class ProjectModule {}
