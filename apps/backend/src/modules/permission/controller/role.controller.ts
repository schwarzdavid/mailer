import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { RequireAbility } from '../decorators/RequireAbility.js'
import { CurrentAbility } from '../decorators/CurrentAbility.js'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { RoleService } from '../services/role.service.js'
import { RoleDto } from '../dtos/role.dto.js'
import { RoleCreateDto, RoleUpdateDto } from '../dtos/role-create.dto.js'
import type { AppAbility } from '../interfaces/app-ability.js'

@JwtAuth()
@ApiTags('role')
@Controller('role')
export class RoleController {
    constructor(private readonly roleService: RoleService) {}

    @RequireAbility({ action: 'read', subject: 'Role' })
    @SerializeOptions({ type: RoleDto })
    @Get()
    async getRoles(): Promise<RoleDto[]> {
        return await this.roleService.getRoles()
    }

    @RequireAbility({ action: 'read', subject: 'Role' })
    @ResponseDto(RoleDto)
    @Get(':roleId')
    async getRole(@Param('roleId', ParseIntPipe) roleId: number): Promise<RoleDto> {
        return await this.roleService.getRoleById(roleId)
    }

    @RequireAbility({ action: 'create', subject: 'Role' })
    @ResponseDto(RoleDto)
    @Post()
    async createRole(@Body() body: RoleCreateDto, @CurrentAbility() ability: AppAbility): Promise<RoleDto> {
        return await this.roleService.createRole(
            {
                name: body.name,
                scope: body.scope,
                description: body.description ?? null,
                permissions: body.permissions,
            },
            ability,
        )
    }

    @RequireAbility({ action: 'update', subject: 'Role' })
    @ResponseDto(RoleDto)
    @Patch(':roleId')
    async updateRole(
        @Param('roleId', ParseIntPipe) roleId: number,
        @Body() body: RoleUpdateDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<RoleDto> {
        return await this.roleService.updateRole(roleId, body, ability)
    }

    @RequireAbility({ action: 'delete', subject: 'Role' })
    @Delete(':roleId')
    async deleteRole(@Param('roleId', ParseIntPipe) roleId: number): Promise<void> {
        await this.roleService.deleteRole(roleId)
    }
}
