import { Injectable, UnauthorizedException } from '@nestjs/common'
import { Credentials } from '../interfaces/credentials.interface'
import { UserWithRole } from '../../user/interfaces/user.interface'
import bcrypt from 'bcryptjs'
import { InjectModel } from '@nestjs/sequelize'
import { UserModel } from '../../user/models/user.model'
import { RoleModel } from '../../permission/models/role.model'

@Injectable()
export class CredentialsService {
    constructor(@InjectModel(UserModel) private readonly userModel: typeof UserModel) {}

    async validateCredentials(credentials: Credentials): Promise<UserWithRole> {
        const user = await this.userModel.findOne({
            where: { email: credentials.email },
            attributes: { include: ['password'] },
            include: [RoleModel],
            rejectOnEmpty: true,
        })
        const isValidPassword = await bcrypt.compare(credentials.password, user.password)

        if (!isValidPassword) {
            throw new UnauthorizedException('Invalid credentials.')
        }

        const { password, ...principal } = user.get({ plain: true }) as UserWithRole & { password: string }
        void password

        return principal
    }
}
