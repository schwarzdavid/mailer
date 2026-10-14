import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { Principal } from '../../auth/decorators/Principal.js'
import { RequireAbility } from '../../permission/decorators/RequireAbility.js'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility.js'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { UserService } from '../services/user.service.js'
import { UserDetailDto, UserDto, UserListDto } from '../dtos/user.dto.js'
import { UserCreateDto, UserPermissionsPutDto, UserUpdateDto } from '../dtos/user-create.dto.js'
import type { UserWithRole } from '../interfaces/user.interface.js'
import type { AppAbility } from '../../permission/interfaces/app-ability.js'

@JwtAuth()
@ApiTags('user')
@Controller('user')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @RequireAbility({ action: 'read', subject: 'User' })
    @SerializeOptions({ type: UserListDto })
    @Get()
    async getUsers(): Promise<UserListDto[]> {
        return await this.userService.getUsers()
    }

    @RequireAbility({ action: 'create', subject: 'User' })
    @ResponseDto(UserDto)
    @Post()
    async createUser(@Body() body: UserCreateDto, @Principal() principal: UserWithRole): Promise<UserDto> {
        return await this.userService.createManagedUser(body, principal)
    }

    @RequireAbility({ action: 'read', subject: 'User' })
    @ResponseDto(UserDetailDto)
    @Get(':userId')
    async getUser(@Param('userId', ParseIntPipe) userId: number): Promise<UserDetailDto> {
        return await this.userService.getUserById(userId)
    }

    @RequireAbility({ action: 'update', subject: 'User' })
    @ResponseDto(UserDto)
    @Patch(':userId')
    async updateUser(
        @Param('userId', ParseIntPipe) userId: number,
        @Body() body: UserUpdateDto,
        @Principal() principal: UserWithRole,
        @CurrentAbility() ability: AppAbility,
    ): Promise<UserDto> {
        return await this.userService.updateUser(userId, body, principal, ability)
    }

    @RequireAbility({ action: 'delete', subject: 'User' })
    @Delete(':userId')
    async deleteUser(
        @Param('userId', ParseIntPipe) userId: number,
        @Principal() principal: UserWithRole,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.userService.deleteUser(userId, principal, ability)
    }

    @RequireAbility({ action: 'update', subject: 'User' })
    @ResponseDto(UserPermissionsPutDto)
    @Put(':userId/permissions')
    async replaceUserPermissions(
        @Param('userId', ParseIntPipe) userId: number,
        @Body() body: UserPermissionsPutDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<UserPermissionsPutDto> {
        return { permissions: await this.userService.replaceUserPermissions(userId, body.permissions, ability) }
    }
}
