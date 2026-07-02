import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtPayload } from '../interfaces/jwt-payload.interface'
import { User } from '../../user/interfaces/user.interface'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { InjectModel } from '@nestjs/sequelize'
import { UserModel } from '../../user/models/user.model'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    private static readonly USER_CACHE_KEY = 'auth:user:'

    constructor(
        readonly configService: ConfigService,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
    ) {
        super({
            secretOrKey: configService.get<string>('BACKEND_JWT_SECRET', 'no-secret'),
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        })
    }

    async validate(payload: JwtPayload): Promise<User> {
        const cacheKey = JwtStrategy.USER_CACHE_KEY + payload.sub
        const cachedUser = await this.cacheManager.get<User>(cacheKey)
        if (cachedUser) {
            return cachedUser
        }

        const user = await this.userModel.findByPk(payload.sub)
        if (!user) {
            throw new UnauthorizedException('Invalid token')
        }

        const principal = user.get({ plain: true })
        void this.cacheManager.set(cacheKey, user)

        return principal
    }
}
