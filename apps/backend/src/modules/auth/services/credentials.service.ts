import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Credentials } from '../interfaces/credentials.interface';
import { User } from '../../user/interfaces/user.interface';
import bcrypt from 'bcryptjs';
import { InjectModel } from '@nestjs/sequelize';
import { UserModel } from '../../user/models/user.model';
import { toUser } from '../../user/mappers/user.mapper';

@Injectable()
export class CredentialsService {
    constructor(@InjectModel(UserModel) private readonly userModel: typeof UserModel) {}

    async validateCredentials(credentials: Credentials): Promise<User> {
        const user = await this.userModel.findOne({ where: { email: credentials.email }, rejectOnEmpty: true });
        const isValidPassword = await bcrypt.compare(credentials.password, user.password);

        if (!isValidPassword) {
            throw new UnauthorizedException('Invalid credentials.');
        }

        return toUser(user);
    }
}
