import { Authentication } from '../interfaces/authentication.interface.js'
import { UserDto } from '../../user/dtos/user.dto.js'
import { Expose, Type } from 'class-transformer'

export class AuthenticationDto implements Authentication {
    @Expose()
    token!: string

    @Expose()
    @Type(() => UserDto)
    user!: UserDto
}
