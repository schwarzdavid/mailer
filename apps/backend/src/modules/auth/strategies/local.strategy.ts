import { PassportStrategy } from '@nestjs/passport'
import { EmptyResultError } from 'sequelize'
import { Strategy } from 'passport-local'
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { CredentialsService } from '../services/credentials.service.js'
import { User } from '../../user/interfaces/user.interface.js'

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
    private readonly logger = new Logger(LocalStrategy.name)

    constructor(private readonly credentialsService: CredentialsService) {
        super({
            usernameField: 'email',
        })
    }

    async validate(email: string, password: string): Promise<User> {
        try {
            return await this.credentialsService.validateCredentials({ email, password })
        } catch (error) {
            if (error instanceof EmptyResultError || error instanceof UnauthorizedException) {
                this.logger.warn('Login failed')
            } else {
                this.logger.error(`Login failed: ${error instanceof Error ? error.name : typeof error}`)
            }
            throw new UnauthorizedException('Invalid credentials.')
        }
    }
}
