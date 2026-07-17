import { Controller, Get, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { RequireAbility } from '../decorators/RequireAbility'
import { RoleService } from '../services/role.service'
import { RoleDto } from '../dtos/role.dto'

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
}
