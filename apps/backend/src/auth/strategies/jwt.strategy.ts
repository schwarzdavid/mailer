import {PassportStrategy} from "@nestjs/passport";
import {ExtractJwt, Strategy} from "passport-jwt";
import {Inject, Injectable, UnauthorizedException} from "@nestjs/common";
import {ConfigService} from "@nestjs/config";
import {JwtPayload} from "../interfaces/jwt-payload.interface";
import {UserDto} from "../../user/dtos/user.dto";
import {CACHE_MANAGER, Cache} from "@nestjs/cache-manager";
import {InjectModel} from "@nestjs/sequelize";
import {UserModel} from "../../user/models/user.model";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    private static readonly USER_CACHE_KEY = 'auth:user:'

    constructor(
        readonly configService: ConfigService,
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel
    ) {
        super({
            secretOrKey: configService.get<string>('JWT_SECRET', 'no-secret'),
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()
        });
    }

    async validate(payload: JwtPayload): Promise<UserDto> {
        const cachedUser = await this.cacheManager.get<UserDto>(JwtStrategy.USER_CACHE_KEY + payload.sub)
        if(cachedUser) {
            return cachedUser
        }
        const user = await this.userModel.findByPk(payload.sub)
        if(user) {
            await this.cacheManager.set(JwtStrategy.USER_CACHE_KEY + payload.sub, user)
            return UserDto.toDto(user)
        }
        throw new UnauthorizedException('Invalid token')
    }
}
