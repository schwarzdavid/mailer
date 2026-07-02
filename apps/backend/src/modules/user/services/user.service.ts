import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { UserModel } from '../models/user.model';
import { User, UserCreate } from '../interfaces/user.interface';
import bcrypt from 'bcryptjs';
import { toUser } from '../mappers/user.mapper';

@Injectable()
export class UserService {
    constructor(@InjectModel(UserModel) private readonly userModel: typeof UserModel) {}

    async createUser(user: UserCreate): Promise<User> {
        const hashedPassword = await bcrypt.hash(user.password, 10);

        const userModel = await this.userModel.create(
            {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                password: hashedPassword,
            },
            { returning: true },
        );

        return toUser(userModel);
    }
}
