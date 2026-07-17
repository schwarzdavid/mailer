import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { UserModel } from '../../user/models/user.model'
import { UserService } from '../../user/services/user.service'
import { UserCreate, UserWithRole } from '../../user/interfaces/user.interface'
import { RoleService } from '../../permission/services/role.service'
import { SETUP_LOCK_KEY } from '../setup.constants'

@Injectable()
export class SetupService {
    constructor(
        private readonly sequelize: Sequelize,
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
    ) {}

    async needsSetup(): Promise<boolean> {
        return (await this.userModel.count()) === 0
    }

    registerFirstUser(user: Omit<UserCreate, 'roleId'>): Promise<UserWithRole> {
        return this.sequelize.transaction(async (transaction) => {
            await this.sequelize.query('SELECT pg_advisory_xact_lock(:key)', {
                replacements: { key: SETUP_LOCK_KEY },
                transaction,
            })

            const userCount = await this.userModel.count({ transaction })
            if (userCount > 0) {
                throw new ForbiddenException('Setup is already completed.')
            }

            const role = await this.roleService.getRoleByType('super_admin')

            return this.userService.createUser({ ...user, roleId: role.roleId }, transaction)
        })
    }
}
