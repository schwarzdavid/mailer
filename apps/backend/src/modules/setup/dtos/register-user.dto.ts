import { Expose } from 'class-transformer'
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'
import { UserCreate } from '../../user/interfaces/user.interface.js'

export class RegisterUserDto implements Omit<UserCreate, 'roleId'> {
    @Expose()
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    firstName!: string

    @Expose()
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    lastName!: string

    @Expose()
    @IsEmail()
    email!: string

    @Expose()
    @IsString()
    @MinLength(8)
    password!: string

    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(256)
    setupToken!: string
}
