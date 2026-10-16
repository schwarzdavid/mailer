import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator'
import { CATALOG_PERMISSIONS, ROLE_SCOPES } from '../permission.constants.js'
import type { CatalogPermission, RoleScope } from '../permission.constants.js'

export class RoleCreateDto {
    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name!: string

    @Expose()
    @IsIn(ROLE_SCOPES)
    @ApiProperty({ enum: ROLE_SCOPES, enumName: 'RoleScope' })
    scope!: RoleScope

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    @ApiProperty({ type: String, required: false, nullable: true })
    description?: string | null

    @Expose()
    @IsArray()
    @IsIn(CATALOG_PERMISSIONS, { each: true })
    @ApiProperty({ enum: CATALOG_PERMISSIONS, enumName: 'CatalogPermission', isArray: true })
    permissions!: CatalogPermission[]
}

export class RoleUpdateDto {
    @Expose()
    @ValidateIf((_, value) => value !== undefined)
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name?: string

    @Expose()
    @IsOptional()
    @IsString()
    @MaxLength(255)
    @ApiProperty({ type: String, required: false, nullable: true })
    description?: string | null

    @Expose()
    @ValidateIf((_, value) => value !== undefined)
    @IsArray()
    @IsIn(CATALOG_PERMISSIONS, { each: true })
    @ApiProperty({ enum: CATALOG_PERMISSIONS, enumName: 'CatalogPermission', isArray: true, required: false })
    permissions?: CatalogPermission[]
}
