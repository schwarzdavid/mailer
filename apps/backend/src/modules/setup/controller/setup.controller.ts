import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { SetupService } from '../services/setup.service.js'
import { SetupStatusDto } from '../dtos/setup-status.dto.js'
import { RegisterUserDto } from '../dtos/register-user.dto.js'
import { AuthenticationDto } from '../../auth/dtos/authentication.dto.js'
import { JwtHelperService } from '../../auth/services/jwt-helper.service.js'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { RequireAbility } from '../../permission/decorators/RequireAbility.js'

@ApiTags('setup')
@UseGuards(ThrottlerGuard)
@Controller('setup')
export class SetupController {
    constructor(
        private readonly setupService: SetupService,
        private readonly jwtHelperService: JwtHelperService,
    ) {}

    @SkipThrottle()
    @ResponseDto(SetupStatusDto)
    @Get('status')
    async getStatus(): Promise<SetupStatusDto> {
        return SetupStatusDto.fromStep(await this.setupService.getStep())
    }

    @JwtAuth()
    @RequireAbility({ action: 'update', subject: 'Settings' })
    @HttpCode(HttpStatus.OK)
    @ResponseDto(SetupStatusDto)
    @Post('finish')
    async finishSetup(): Promise<SetupStatusDto> {
        return SetupStatusDto.fromStep(await this.setupService.finishSetup())
    }

    @HttpCode(HttpStatus.OK)
    @ResponseDto(AuthenticationDto)
    @Post('user')
    async registerUser(@Body() registration: RegisterUserDto): Promise<AuthenticationDto> {
        const user = await this.setupService.registerFirstUser(registration)
        const token = await this.jwtHelperService.createToken(user)

        return { token, user }
    }
}
