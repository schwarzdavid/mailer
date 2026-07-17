import { Controller, Get, HttpCode, HttpStatus, Post, SerializeOptions, UseGuards } from '@nestjs/common'
import { CredentialsDto } from '../dtos/credentials.dto'
import { AuthenticationDto } from '../dtos/authentication.dto'
import { LocalAuthGuard } from '../guards/local-auth.guard'
import { JwtAuth } from '../decorators/JwtAuth'
import { JwtHelperService } from '../services/jwt-helper.service'
import { Principal } from '../decorators/Principal'
import type { UserWithRole } from '../../user/interfaces/user.interface'
import { UserDto } from '../../user/dtos/user.dto'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { ApiBody, ApiTags } from '@nestjs/swagger'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility'
import type { AppAbility } from '../../permission/interfaces/app-ability'
import { AbilityRuleDto } from '../dtos/ability-rule.dto'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly jwtHelperService: JwtHelperService) {}

    @ApiBody({ type: CredentialsDto })
    @HttpCode(HttpStatus.OK)
    @UseGuards(LocalAuthGuard)
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
}
