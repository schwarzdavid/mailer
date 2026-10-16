import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { CATALOG_PERMISSIONS, ROLE_SCOPES, ROLE_TYPES } from '../permission.constants.js'
import type { CatalogPermission, RoleScope, RoleType } from '../permission.constants.js'

export class RoleDto {
    @Expose()
    roleId!: number

    @Expose()
    name!: string

    @Expose()
    @ApiProperty({ enum: ROLE_SCOPES, enumName: 'RoleScope' })
    scope!: RoleScope

    @Expose()
    @ApiProperty({ enum: ROLE_TYPES, enumName: 'RoleType' })
    type!: RoleType

    @Expose()
    @ApiProperty({ type: String, nullable: true })
    description!: string | null

    @Expose()
    @ApiProperty({ enum: CATALOG_PERMISSIONS, enumName: 'CatalogPermission', isArray: true })
    permissions!: CatalogPermission[]

    @Expose()
    @ApiProperty({ type: Number })
    assignmentCount!: number
}
