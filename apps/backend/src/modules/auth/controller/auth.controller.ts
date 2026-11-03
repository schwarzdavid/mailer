import { Controller, Get, HttpCode, HttpStatus, Post, SerializeOptions, UseGuards } from '@nestjs/common'
import { CredentialsDto } from '../dtos/credentials.dto.js'
import { AuthenticationDto } from '../dtos/authentication.dto.js'
import { LocalAuthGuard } from '../guards/local-auth.guard.js'
import { JwtAuth } from '../decorators/JwtAuth.js'
import { JwtHelperService } from '../services/jwt-helper.service.js'
import { Principal } from '../decorators/Principal.js'
import type { UserWithRole } from '../../user/interfaces/user.interface.js'
import { UserDto } from '../../user/dtos/user.dto.js'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { ApiBody, ApiTags } from '@nestjs/swagger'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility.js'
import type { AppAbility } from '../../permission/interfaces/app-ability.js'
import { AbilityRuleDto } from '../dtos/ability-rule.dto.js'
import { AuthPermissionsDto } from '../dtos/auth-permissions.dto.js'
import { Throttle } from '@nestjs/throttler'
import { AppThrottlerGuard } from '../../throttler-storage/guards/app-throttler.guard.js'
import { FailClosedThrottle } from '../../throttler-storage/decorators/FailClosedThrottle.js'
import {
    LOGIN_THROTTLE_BLOCK_MS,
    LOGIN_THROTTLE_LIMIT,
    LOGIN_THROTTLE_TTL_MS,
    loginThrottleTracker,
} from '../auth.constants.js'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly jwtHelperService: JwtHelperService) {}

    @ApiBody({ type: CredentialsDto })
    @HttpCode(HttpStatus.OK)
    @Throttle({
        default: {
            limit: LOGIN_THROTTLE_LIMIT,
            ttl: LOGIN_THROTTLE_TTL_MS,
            blockDuration: LOGIN_THROTTLE_BLOCK_MS,
            getTracker: loginThrottleTracker,
        },
    })
    @FailClosedThrottle()
    @UseGuards(AppThrottlerGuard, LocalAuthGuard)
    @ResponseDto(AuthenticationDto)
    @Post('login')
    async login(@Principal() principal: UserWithRole): Promise<AuthenticationDto> {
        const token = await this.jwtHelperService.createToken(principal)

        return {
            token,
            user: principal,
        }
    }

    @JwtAuth()
    @ResponseDto(UserDto)
    @Get('user')
    currentUser(@Principal() principal: UserWithRole): UserDto {
        return principal
    }

    @JwtAuth()
    @SerializeOptions({ type: AbilityRuleDto })
    @Get('ability')
    getAbility(@CurrentAbility() ability: AppAbility): AbilityRuleDto[] {
        return ability.rules.map((rule) => AbilityRuleDto.fromRule(rule))
    }

    @JwtAuth()
    @ResponseDto(AuthPermissionsDto)
    @Get('permissions')
    getHeldPermissions(@CurrentAbility() ability: AppAbility): AuthPermissionsDto {
        return AuthPermissionsDto.fromAbility(ability)
    }
}
