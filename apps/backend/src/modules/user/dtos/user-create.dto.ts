import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { IsArray, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator'
import { GLOBAL_PERMISSIONS, Permission } from '../../permission/permission.constants'

export class UserCreateDto {
    @Expose()
    @IsString()
    @IsNotEmpty()
    firstName!: string

    @Expose()
    @IsString()
    @IsNotEmpty()
    lastName!: string

    @Expose()
    @IsEmail()
    email!: string

    @Expose()
    @IsString()
    @MinLength(8)
    password!: string

    @Expose()
    @IsOptional()
    @IsInt()
    roleId?: number
}

export class UserUpdateDto {
    @Expose()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    firstName?: string

    @Expose()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    lastName?: string

    @Expose()
    @IsOptional()
    @IsEmail()
    email?: string

    @Expose()
    @IsOptional()
    @IsString()
    @MinLength(8)
    password?: string

    @Expose()
    @IsOptional()
    @IsInt()
    roleId?: number
}

export class UserPermissionsPutDto {
    @Expose()
    @IsArray()
    @IsIn(GLOBAL_PERMISSIONS, { each: true })
    @ApiProperty({ enum: GLOBAL_PERMISSIONS, enumName: 'Permission', isArray: true })
    permissions!: Permission[]
}
