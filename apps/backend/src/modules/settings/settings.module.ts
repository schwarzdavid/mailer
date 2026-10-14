import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { SettingsModel } from './models/settings.model.js'
import { SettingsController } from './controller/settings.controller.js'
import { SettingsService } from './services/settings.service.js'
import { DomainModule } from '../domain/domain.module.js'

@Module({
    imports: [SequelizeModule.forFeature([SettingsModel]), DomainModule],
    controllers: [SettingsController],
    providers: [SettingsService],
    exports: [SettingsService],
})
export class SettingsModule {}
