import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { SettingsModel } from './models/settings.model'
import { SettingsController } from './controller/settings.controller'
import { SettingsService } from './services/settings.service'
import { DomainModule } from '../domain/domain.module'

@Module({
    imports: [SequelizeModule.forFeature([SettingsModel]), DomainModule],
    controllers: [SettingsController],
    providers: [SettingsService],
    exports: [SettingsService],
})
export class SettingsModule {}
