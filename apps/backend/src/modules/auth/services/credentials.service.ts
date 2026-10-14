import { Injectable, UnauthorizedException } from '@nestjs/common'
import { Credentials } from '../interfaces/credentials.interface.js'
import { UserWithRole } from '../../user/interfaces/user.interface.js'
import bcrypt from 'bcryptjs'
import { InjectModel } from '@nestjs/sequelize'
import { UserModel } from '../../user/models/user.model.js'
import { RoleModel } from '../../permission/models/role.model.js'
import { userWithRoleFromRow } from '../../user/mappers/user.mapper.js'
import { normalizeEmail } from '../../user/helpers/normalize-email.js'

@Injectable()
export class CredentialsService {
    constructor(@InjectModel(UserModel) private readonly userModel: typeof UserModel) {}

    async validateCredentials(credentials: Credentials): Promise<UserWithRole> {
        const user = await this.userModel.findOne({
            where: { email: normalizeEmail(credentials.email) },
            attributes: { include: ['password'] },
            include: [RoleModel],
            rejectOnEmpty: true,
        })
        const isValidPassword = await bcrypt.compare(credentials.password, user.password)

        if (!isValidPassword) {
            throw new UnauthorizedException('Invalid credentials.')
        }

        return userWithRoleFromRow(user)
    }
}
