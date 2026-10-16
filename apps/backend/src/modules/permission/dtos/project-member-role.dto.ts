import { Expose } from 'class-transformer'

export class ProjectMemberRoleDto {
    @Expose()
    roleId!: number

    @Expose()
    name!: string
}
