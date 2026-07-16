import { Expose } from 'class-transformer'
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator'
import { UserCreate } from '../../user/interfaces/user.interface'

export class RegisterUserDto implements UserCreate {
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
}
