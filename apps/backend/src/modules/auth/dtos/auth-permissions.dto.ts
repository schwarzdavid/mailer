import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { GLOBAL_PERMISSIONS, PROJECT_PERMISSIONS } from '../../permission/permission.constants.js'
import type { Permission, ProjectPermission } from '../../permission/permission.constants.js'
import { heldPermissions, heldProjectPermissionsEverywhere } from '../../permission/helpers/holds-permission.js'
import type { AppAbility } from '../../permission/interfaces/app-ability.js'

export class AuthPermissionsDto {
    @Expose()
    @ApiProperty({ enum: GLOBAL_PERMISSIONS, enumName: 'Permission', isArray: true })
    permissions!: Permission[]

    @Expose()
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true })
    projectPermissions!: ProjectPermission[]

    static fromAbility(ability: AppAbility): AuthPermissionsDto {
        return {
            permissions: heldPermissions(ability),
            projectPermissions: heldProjectPermissionsEverywhere(ability),
        }
    }
}
