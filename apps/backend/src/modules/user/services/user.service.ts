import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import type { Transaction } from 'sequelize'
import { UserModel } from '../models/user.model'
import { User, UserCreate } from '../interfaces/user.interface'
import bcrypt from 'bcryptjs'

@Injectable()
export class UserService {
    constructor(@InjectModel(UserModel) private readonly userModel: typeof UserModel) {}

    async createUser(user: UserCreate, transaction?: Transaction): Promise<User> {
        const hashedPassword = await bcrypt.hash(user.password, 10)

        const userModel = await this.userModel.create(
            {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                password: hashedPassword,
            },
            { returning: true, transaction },
        )

        return userModel.get({ plain: true })
    }
}
