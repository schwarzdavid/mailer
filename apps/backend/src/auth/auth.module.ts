import {forwardRef, Module} from '@nestjs/common';
import {CredentialsService} from './services/credentials.service';
import {AuthController} from './controller/auth.controller';
import {LocalStrategy} from "./strategies/local.strategy";
import {JwtStrategy} from "./strategies/jwt.strategy";
import {UserModule} from "../user/user.module";

@Module({
    imports: [forwardRef(() => UserModule)],
    providers: [CredentialsService, LocalStrategy, JwtStrategy],
    controllers: [AuthController]
})
export class AuthModule {
}
