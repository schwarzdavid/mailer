import { Expose, Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsIn, IsInt, IsOptional } from 'class-validator'
import { isProjectPermission, PROJECT_PERMISSIONS, ProjectPermission } from '../../permission/permission.constants.js'
import { ProjectMemberRoleDto } from '../../permission/dtos/project-member-role.dto.js'
import type { RoleWithPermissions } from '../../permission/interfaces/role.interface.js'
import { ProjectImplicitAccess } from '../interfaces/project.interface.js'

export class ProjectMemberPutDto {
    @Expose()
    @IsInt()
    roleId!: number

    @Expose()
    @IsOptional()
    @IsArray()
    @IsIn(PROJECT_PERMISSIONS, { each: true })
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true, required: false })
    permissions?: ProjectPermission[]
}

export class ProjectMemberDto {
    @Expose()
    userId!: number

    @Expose()
    firstName!: string

    @Expose()
    lastName!: string

    @Expose()
    email!: string

    @Expose()
    @Type(() => ProjectMemberRoleDto)
    role!: ProjectMemberRoleDto

    @Expose()
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true })
    permissions!: ProjectPermission[]
}

export class ProjectRoleDto {
    @Expose()
    roleId!: number

    @Expose()
    name!: string

    @Expose()
    @ApiProperty({ type: String, nullable: true })
    description!: string | null

    @Expose()
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true })
    permissions!: ProjectPermission[]

    static fromRole(role: RoleWithPermissions): ProjectRoleDto {
        return {
            roleId: role.roleId,
            name: role.name,
            description: role.description,
            permissions: role.permissions.filter(isProjectPermission),
        }
    }
}

export class ProjectImplicitAccessDto {
    @Expose()
    @ApiProperty({ type: Number })
    superAdminCount!: number

    @Expose()
    @ApiProperty({ type: Number })
    allProjectsUserCount!: number

    static fromImplicitAccess(access: ProjectImplicitAccess): ProjectImplicitAccessDto {
        return {
            superAdminCount: access.superAdminCount,
            allProjectsUserCount: access.allProjectsUserCount,
        }
    }
}
