import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { GLOBAL_PERMISSIONS, ROLE_TYPES } from '../permission.constants'
import type { Permission, RoleType } from '../permission.constants'

export class RoleDto {
    @Expose()
    roleId!: number

    @Expose()
    name!: string

    @Expose()
    @ApiProperty({ enum: ROLE_TYPES, enumName: 'RoleType' })
    type!: RoleType

    @Expose()
    @ApiProperty({ enum: GLOBAL_PERMISSIONS, enumName: 'Permission', isArray: true })
    permissions!: Permission[]
}
