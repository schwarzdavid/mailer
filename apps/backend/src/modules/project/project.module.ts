import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { ProjectModel } from './models/project.model'
import { ProjectDomainModel } from './models/project-domain.model'
import { InboundFormModel } from '../inbound-form/models/inbound-form.model'
import { DomainModule } from '../domain/domain.module'
import { ProjectService } from './services/project.service'
import { ProjectPurgeService } from './services/project-purge.service'
import { ProjectController } from './controller/project.controller'

@Module({
    imports: [SequelizeModule.forFeature([ProjectModel, ProjectDomainModel, InboundFormModel]), DomainModule],
    controllers: [ProjectController],
    providers: [ProjectService, ProjectPurgeService],
    exports: [ProjectService],
})
export class ProjectModule {}
