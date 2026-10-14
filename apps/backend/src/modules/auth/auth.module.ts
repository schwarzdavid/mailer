import { forwardRef, Module } from '@nestjs/common'
import { CredentialsService } from './services/credentials.service.js'
import { AuthController } from './controller/auth.controller.js'
import { LocalStrategy } from './strategies/local.strategy.js'
import { JwtStrategy } from './strategies/jwt.strategy.js'
import { UserModule } from '../user/user.module.js'
import { JwtHelperService } from './services/jwt-helper.service.js'

@Module({
    imports: [forwardRef(() => UserModule)],
    providers: [CredentialsService, LocalStrategy, JwtStrategy, JwtHelperService],
    controllers: [AuthController],
})
export class AuthModule {}
