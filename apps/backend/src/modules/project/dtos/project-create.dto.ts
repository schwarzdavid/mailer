import { Expose } from 'class-transformer'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class ProjectCreateDto {
    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name!: string
}

export class ProjectUpdateDto extends ProjectCreateDto {}
