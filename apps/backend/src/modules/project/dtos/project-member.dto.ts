import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { ArrayNotEmpty, IsArray, IsIn } from 'class-validator'
import { PROJECT_PERMISSIONS, ProjectPermission } from '../../permission/permission.constants'

export class ProjectMemberPutDto {
    @Expose()
    @IsArray()
    @ArrayNotEmpty()
    @IsIn(PROJECT_PERMISSIONS, { each: true })
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true })
    permissions!: ProjectPermission[]
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
    @ApiProperty({ enum: PROJECT_PERMISSIONS, enumName: 'ProjectPermission', isArray: true })
    permissions!: ProjectPermission[]
}
