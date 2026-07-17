import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { RoleModel } from '../models/role.model'
import { RolePermissionModel } from '../models/role-permission.model'
import { Role, RoleWithPermissions } from '../interfaces/role.interface'
import { RoleType } from '../permission.constants'

@Injectable()
export class RoleService {
    constructor(@InjectModel(RoleModel) private readonly roleModel: typeof RoleModel) {}

    async getRoles(): Promise<RoleWithPermissions[]> {
        const rows = await this.roleModel.findAll({ include: [RolePermissionModel] })

        return rows.map((row) => {
            const plain = row.get({ plain: true }) as Role & { permissions: { permission: string }[] }
            const { permissions, ...roleFields } = plain

            return {
                ...roleFields,
                permissions: permissions.map((entry) => entry.permission),
            } as RoleWithPermissions
        })
    }

    async getRoleById(roleId: number): Promise<Role> {
        const row = await this.roleModel.findByPk(roleId)
        if (!row) {
            throw new BadRequestException('Unknown role')
        }

        return row.get({ plain: true })
    }

    async getRoleByType(type: RoleType): Promise<Role> {
        const row = await this.roleModel.findOne({ where: { type }, rejectOnEmpty: true })

        return row.get({ plain: true })
    }
}
