import {Controller, Get, HttpCode, HttpStatus, Post, UseGuards} from '@nestjs/common';
import {CredentialsDto} from "../dtos/credentials.dto";
import {AuthenticationDto} from "../dtos/authentication.dto";
import {LocalAuthGuard} from "../guards/local-auth.guard";
import {JwtHelperService} from "../services/jwt-helper.service";
import {Principal} from "../decorators/Principal";
import {UserDto} from "../../user/dtos/user.dto";
import {ApiBody, ApiTags} from "@nestjs/swagger";

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly jwtHelperService: JwtHelperService,
    ) {
    }

    @ApiBody({type: CredentialsDto})
    @HttpCode(HttpStatus.OK)
    @UseGuards(LocalAuthGuard)
    @Post('login')
    async login(@Principal() principal: UserDto): Promise<AuthenticationDto> {
        const token = await this.jwtHelperService.createToken(principal)

        return {
            token,
            user: principal
        }
    }

    @Get('user')
    currentUser(@Principal() principal: UserDto): UserDto {
        return principal
    }
}
