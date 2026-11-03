import { Module } from '@nestjs/common'
import { UserModule } from '../user/user.module.js'
import { SetupController } from './controller/setup.controller.js'
import { SetupService } from './services/setup.service.js'
import { SetupTokenService } from './services/setup-token.service.js'
import { JwtHelperService } from '../auth/services/jwt-helper.service.js'
import { SettingsModule } from '../settings/settings.module.js'

@Module({
    imports: [UserModule, SettingsModule],
    controllers: [SetupController],
    providers: [SetupService, SetupTokenService, JwtHelperService],
})
export class SetupModule {}
