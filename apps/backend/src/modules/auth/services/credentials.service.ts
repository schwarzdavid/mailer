import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Credentials } from '../interfaces/credentials.interface';
import { UserDto } from '../../user/dtos/user.dto';
import bcrypt from 'bcryptjs';
import { InjectModel } from '@nestjs/sequelize';
import { UserModel } from '../../user/models/user.model';

@Injectable()
export class CredentialsService {
    constructor(@InjectModel(UserModel) private readonly userModel: typeof UserModel) {}

    async validateCredentials(credentials: Credentials): Promise<UserDto> {
        const user = await this.userModel.findOne({ where: { email: credentials.email }, rejectOnEmpty: true });
        const isValidPassword = await bcrypt.compare(credentials.password, user.password);

        if (!isValidPassword) {
            throw new UnauthorizedException('Invalid credentials.');
        }

        return UserDto.toDto(user);
    }
}
