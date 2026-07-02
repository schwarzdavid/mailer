import { Credentials } from '../interfaces/credentials.interface'
import { IsEmail, IsString, MinLength } from 'class-validator'
import { Expose } from 'class-transformer'

export class CredentialsDto implements Credentials {
    @Expose()
    @IsEmail()
    email!: string

    @Expose()
    @MinLength(1, { message: 'ERRORS.VALIDATION.REQUIRED' })
    @IsString()
    password!: string
}
