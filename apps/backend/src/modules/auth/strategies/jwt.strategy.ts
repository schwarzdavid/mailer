import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtPayload } from '../interfaces/jwt-payload.interface'
import { UserWithRole } from '../../user/interfaces/user.interface'
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager'
import { InjectModel } from '@nestjs/sequelize'
import { UserModel } from '../../user/models/user.model'
import { RoleModel } from '../../permission/models/role.model'
import { AUTH_USER_CACHE_PREFIX } from '../../permission/permission.constants'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
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

    async validate(payload: JwtPayload): Promise<UserWithRole> {
        const cacheKey = AUTH_USER_CACHE_PREFIX + payload.sub
        const cachedUser = await this.cacheManager.get<UserWithRole>(cacheKey)
        if (cachedUser?.roleId) {
            return cachedUser
        }

        const user = await this.userModel.findByPk(payload.sub, { include: [RoleModel] })
        if (!user) {
            throw new UnauthorizedException('Invalid token')
        }

        const principal = user.get({ plain: true }) as UserWithRole & { password: string }
        void this.cacheManager.set(cacheKey, principal).catch(() => undefined)

        return principal
    }
}
