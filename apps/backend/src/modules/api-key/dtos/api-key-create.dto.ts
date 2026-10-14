import { Expose } from 'class-transformer'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class ApiKeyCreateDto {
    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    name!: string
}
