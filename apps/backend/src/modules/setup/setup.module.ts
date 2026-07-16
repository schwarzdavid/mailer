import { Module } from '@nestjs/common'
import { UserModule } from '../user/user.module'
import { SetupController } from './controller/setup.controller'
import { SetupService } from './services/setup.service'
import { JwtHelperService } from '../auth/services/jwt-helper.service'

@Module({
    imports: [UserModule],
    controllers: [SetupController],
    providers: [SetupService, JwtHelperService],
})
export class SetupModule {}
