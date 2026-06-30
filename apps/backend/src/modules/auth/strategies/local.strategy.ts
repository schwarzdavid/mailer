import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { CredentialsService } from '../services/credentials.service';
import { UserDto } from '../../user/dtos/user.dto';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
    private readonly logger = new Logger(LocalStrategy.name);

    constructor(private readonly credentialsService: CredentialsService) {
        super({
            usernameField: 'email',
        });
    }

    async validate(email: string, password: string): Promise<UserDto> {
        try {
            return await this.credentialsService.validateCredentials({ email, password });
        } catch (err) {
            this.logger.error(err);
            throw new UnauthorizedException('Invalid credentials.');
        }
    }
}
