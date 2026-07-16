import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ThrottlerGuard } from '@nestjs/throttler'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { SetupService } from '../services/setup.service'
import { SetupStatusDto } from '../dtos/setup-status.dto'
import { RegisterUserDto } from '../dtos/register-user.dto'
import { AuthenticationDto } from '../../auth/dtos/authentication.dto'
import { JwtHelperService } from '../../auth/services/jwt-helper.service'

@ApiTags('setup')
@UseGuards(ThrottlerGuard)
@Controller('setup')
export class SetupController {
    constructor(
        private readonly setupService: SetupService,
        private readonly jwtHelperService: JwtHelperService,
    ) {}

    @ResponseDto(SetupStatusDto)
    @Get('status')
    async getStatus(): Promise<SetupStatusDto> {
        return { needsSetup: await this.setupService.needsSetup() }
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
