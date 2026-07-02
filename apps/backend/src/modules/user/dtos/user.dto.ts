import { User } from '../interfaces/user.interface'
import { Expose } from 'class-transformer'

export class UserDto implements User {
    @Expose()
    userId!: number

    @Expose()
    firstName!: string

    @Expose()
    lastName!: string

    @Expose()
    email!: string

    @Expose()
    createdAt!: Date

    @Expose()
    updatedAt!: Date
}
