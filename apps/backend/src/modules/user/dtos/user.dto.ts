import { User } from '../interfaces/user.interface'
import { Expose, Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { GLOBAL_PERMISSIONS, PROJECT_PERMISSIONS, ROLE_TYPES } from '../../permission/permission.constants'
import type { Permission, ProjectPermission, RoleType } from '../../permission/permission.constants'

export class UserRoleDto {
    @Expose()
    roleId!: number

    @Expose()
    name!: string

    @Expose()
    @ApiProperty({ enum: ROLE_TYPES, enumName: 'RoleType' })
    type!: RoleType
}

export class UserDto implements Omit<User, 'roleId'> {
    @Expose()
    userId!: number

    @Expose()
    firstName!: string

    @Expose()
    lastName!: string

    @Expose()
    email!: string

    @Expose()
    @Type(() => UserRoleDto)
    role!: UserRoleDto

    @Expose()
    createdAt!: Date

    @Expose()
    updatedAt!: Date
}

export class UserMembershipDto {
    @Expose()
    projectId!: number

    @Expose()
    projectName!: string

    @Expose()
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true })
    permissions!: ProjectPermission[]
}

export class UserDetailDto extends UserDto {
    @Expose()
    @ApiProperty({ enum: GLOBAL_PERMISSIONS, enumName: 'Permission', isArray: true })
    permissions!: Permission[]

    @Expose()
    @Type(() => UserMembershipDto)
    memberships!: UserMembershipDto[]
}
