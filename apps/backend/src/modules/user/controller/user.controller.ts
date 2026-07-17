import { Body, Controller, Delete, Get, Param, Patch, Post, Put, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { Principal } from '../../auth/decorators/Principal'
import { RequireAbility } from '../../permission/decorators/RequireAbility'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { UserService } from '../services/user.service'
import { UserDetailDto, UserDto } from '../dtos/user.dto'
import { UserCreateDto, UserPermissionsPutDto, UserUpdateDto } from '../dtos/user-create.dto'
import type { UserWithRole } from '../interfaces/user.interface'
import type { AppAbility } from '../../permission/interfaces/app-ability'

@JwtAuth()
@ApiTags('user')
@Controller('user')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @RequireAbility({ action: 'read', subject: 'User' })
    @SerializeOptions({ type: UserDto })
    @Get()
    async getUsers(): Promise<UserDto[]> {
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
    async getUser(@Param('userId') userId: number): Promise<UserDetailDto> {
        return await this.userService.getUserById(userId)
    }

    @RequireAbility({ action: 'update', subject: 'User' })
    @ResponseDto(UserDto)
    @Patch(':userId')
    async updateUser(
        @Param('userId') userId: number,
        @Body() body: UserUpdateDto,
        @Principal() principal: UserWithRole,
        @CurrentAbility() ability: AppAbility,
    ): Promise<UserDto> {
        return await this.userService.updateUser(userId, body, principal, ability)
    }

    @RequireAbility({ action: 'delete', subject: 'User' })
    @Delete(':userId')
    async deleteUser(
        @Param('userId') userId: number,
        @Principal() principal: UserWithRole,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.userService.deleteUser(userId, principal, ability)
    }

    @RequireAbility({ action: 'update', subject: 'User' })
    @ResponseDto(UserPermissionsPutDto)
    @Put(':userId/permissions')
    async replaceUserPermissions(
        @Param('userId') userId: number,
        @Body() body: UserPermissionsPutDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<UserPermissionsPutDto> {
        return { permissions: await this.userService.replaceUserPermissions(userId, body.permissions, ability) }
    }
}
