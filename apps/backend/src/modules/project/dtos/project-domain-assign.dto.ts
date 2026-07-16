import { Expose } from 'class-transformer'
import { IsInt } from 'class-validator'

export class ProjectDomainAssignDto {
    @Expose()
    @IsInt()
    domainId!: number
}
