import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { UserModel } from '../../user/models/user.model.js'
import { UserService } from '../../user/services/user.service.js'
import { UserCreate, UserWithRole } from '../../user/interfaces/user.interface.js'
import { RoleService } from '../../permission/services/role.service.js'
import { SettingsService } from '../../settings/services/settings.service.js'
import { SETUP_LOCK_KEY, SetupStep } from '../setup.constants.js'
import { SetupTokenService } from './setup-token.service.js'

@Injectable()
export class SetupService {
    constructor(
        private readonly sequelize: Sequelize,
        private readonly userService: UserService,
        private readonly roleService: RoleService,
        private readonly settingsService: SettingsService,
        private readonly setupTokenService: SetupTokenService,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
    ) {}

    async getStep(): Promise<SetupStep> {
        if ((await this.userModel.count()) === 0) {
            return 'account'
        }

        const settings = await this.settingsService.getSettings()
        if (!settings?.sendingDomainId) {
            return 'sendingDomain'
        }

        return settings.setupFinishedAt === null ? 'records' : 'finished'
    }

    async finishSetup(): Promise<SetupStep> {
        await this.settingsService.finishSetup()

        return this.getStep()
    }

    async registerFirstUser(user: Omit<UserCreate, 'roleId'>, setupToken: string): Promise<UserWithRole> {
        if (!this.setupTokenService.matches(setupToken)) {
            throw new ForbiddenException('Invalid setup token')
        }

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
