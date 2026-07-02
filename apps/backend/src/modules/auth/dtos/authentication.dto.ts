import { Authentication } from '../interfaces/authentication.interface'
import { UserDto } from '../../user/dtos/user.dto'
import { Expose } from 'class-transformer'

export class AuthenticationDto implements Authentication {
    @Expose()
    token!: string

    @Expose()
    user!: UserDto
}
