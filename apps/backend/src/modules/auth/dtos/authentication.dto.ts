import { Authentication } from '../interfaces/authentication.interface'
import { UserDto } from '../../user/dtos/user.dto'
import { Expose, Type } from 'class-transformer'

export class AuthenticationDto implements Authentication {
    @Expose()
    token!: string

    @Expose()
    @Type(() => UserDto)
    user!: UserDto
}
