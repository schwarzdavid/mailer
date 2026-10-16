import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { UniqueConstraintError } from 'sequelize'
import { subject } from '@casl/ability'
import bcrypt from 'bcryptjs'
import { UserModel } from '../models/user.model.js'
import {
    FullUser,
    ManagedUserCreate,
    UserCreate,
    UserDetail,
    UserListEntry,
    UserUpdate,
    UserWithRole,
} from '../interfaces/user.interface.js'
import { RoleModel } from '../../permission/models/role.model.js'
import { UserPermissionModel } from '../../permission/models/user-permission.model.js'
import { RoleService } from '../../permission/services/role.service.js'
import { ProjectMemberService } from '../../permission/services/project-member.service.js'
import { PermissionCacheService } from '../../permission/services/permission-cache.service.js'
import { RoleWithPermissions } from '../../permission/interfaces/role.interface.js'
import { AppAbility } from '../../permission/interfaces/app-ability.js'
import { isGlobalPermission, Permission } from '../../permission/permission.constants.js'
import { holdsPermission } from '../../permission/helpers/holds-permission.js'
import { assertPermissionChangesHeld, assertRoleGrantable } from '../../permission/helpers/permission-grants.js'
import { userWithRoleFromRow } from '../mappers/user.mapper.js'
import { normalizeEmail } from '../helpers/normalize-email.js'

@Injectable()
export class UserService {
    constructor(
        @InjectModel(UserModel) private readonly userModel: typeof UserModel,
        @InjectModel(UserPermissionModel) private readonly userPermissionModel: typeof UserPermissionModel,
        private readonly roleService: RoleService,
        private readonly projectMemberService: ProjectMemberService,
        private readonly permissionCacheService: PermissionCacheService,
        private readonly sequelize: Sequelize,
    ) {}

    async createUser(user: UserCreate, transaction?: Transaction): Promise<UserWithRole> {
        const hashedPassword = await bcrypt.hash(user.password, 10)

        const created = await this.userModel.create(
            {
                firstName: user.firstName,
                lastName: user.lastName,
                email: normalizeEmail(user.email),
                password: hashedPassword,
                roleId: user.roleId,
            },
            { returning: true, transaction },
        )

        const withRole = await this.userModel.findByPk(created.userId, {
            include: [RoleModel],
            rejectOnEmpty: true,
            transaction,
        })

        return userWithRoleFromRow(withRole)
    }

    async createManagedUser(
        user: ManagedUserCreate,
        principal: UserWithRole,
        ability: AppAbility,
    ): Promise<UserWithRole> {
        const role = await this.loadGlobalRole(user.roleId)
        this.assertRoleGrantableBy(role, principal, ability)

        const permissions = [...new Set(user.permissions)]
        assertPermissionChangesHeld([], permissions, (permission) => holdsPermission(ability, permission))

        try {
            return await this.sequelize.transaction(async (transaction) => {
                const created = await this.createUser({ ...user, roleId: role.roleId }, transaction)
                await this.userPermissionModel.bulkCreate(
                    permissions.map((permission) => ({ userId: created.userId, permission })),
                    { transaction },
                )

                return created
            })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Email is already in use')
            }
            throw error
        }
    }

    async getUsers(): Promise<UserListEntry[]> {
        const [rows, membershipCounts] = await Promise.all([
            this.userModel.findAll({ include: [RoleModel] }),
            this.projectMemberService.countMembershipsPerUser(),
        ])

        return rows.map((row) => {
            const user = userWithRoleFromRow(row)

            return { ...user, membershipCount: membershipCounts.get(user.userId) ?? 0 }
        })
    }

    async getUserById(userId: number): Promise<UserDetail> {
        const row = await this.loadUser(userId)

        const [permissions, memberships] = await Promise.all([
            this.userPermissionModel.findAll({ where: { userId } }),
            this.projectMemberService.getMembershipsForUser(userId),
        ])

        return {
            ...userWithRoleFromRow(row),
            permissions: permissions.map((entry) => entry.permission),
            memberships,
        }
    }

    async updateUser(
        userId: number,
        update: UserUpdate,
        principal: UserWithRole,
        ability: AppAbility,
    ): Promise<UserWithRole> {
        const row = await this.loadUser(userId)
        const target = userWithRoleFromRow(row)

        this.assertCanManage(ability, 'update', target)

        const changes: Partial<FullUser> = {}
        if (update.firstName !== undefined) {
            changes.firstName = update.firstName
        }
        if (update.lastName !== undefined) {
            changes.lastName = update.lastName
        }
        if (update.email !== undefined) {
            changes.email = normalizeEmail(update.email)
        }
        if (update.password !== undefined) {
            changes.password = await bcrypt.hash(update.password, 10)
        }
        if (update.roleId !== undefined && update.roleId !== target.roleId) {
            const newRole = await this.loadGlobalRole(update.roleId)
            this.assertRoleGrantableBy(newRole, principal, ability)
            if (target.role.type === 'super_admin') {
                await this.assertNotLastSuperAdmin()
            }
            changes.roleId = newRole.roleId
        }

        try {
            await row.update(changes)
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Email is already in use')
            }
            throw error
        }

        await this.permissionCacheService.invalidateUser(userId)

        const reloaded = await this.userModel.findByPk(userId, { include: [RoleModel], rejectOnEmpty: true })

        return userWithRoleFromRow(reloaded)
    }

    async deleteUser(userId: number, principal: UserWithRole, ability: AppAbility): Promise<void> {
        if (userId === principal.userId) {
            throw new BadRequestException('You cannot delete yourself')
        }

        const row = await this.loadUser(userId)
        const target = userWithRoleFromRow(row)

        this.assertCanManage(ability, 'delete', target)

        if (target.role.type === 'super_admin') {
            await this.assertNotLastSuperAdmin()
        }

        await row.destroy()
        await this.permissionCacheService.invalidateUser(userId)
    }

    async replaceUserPermissions(
        userId: number,
        permissions: Permission[],
        ability: AppAbility,
    ): Promise<Permission[]> {
        const row = await this.loadUser(userId)
        const target = userWithRoleFromRow(row)

        this.assertCanManage(ability, 'update', target)

        const uniquePermissions = [...new Set(permissions)]
        const current = await this.userPermissionModel.findAll({ where: { userId } })
        assertPermissionChangesHeld(
            current.map((entry) => entry.permission),
            uniquePermissions,
            (permission) => holdsPermission(ability, permission),
        )

        await this.sequelize.transaction(async (transaction) => {
            await this.userPermissionModel.destroy({ where: { userId }, transaction })
            await this.userPermissionModel.bulkCreate(
                uniquePermissions.map((permission) => ({ userId, permission })),
                { transaction },
            )
        })

        await this.permissionCacheService.invalidateUser(userId)

        return uniquePermissions
    }

    private assertCanManage(ability: AppAbility, action: 'update' | 'delete', target: UserWithRole): void {
        if (!ability.can(action, subject('User', { ...target }))) {
            throw new ForbiddenException('Insufficient permissions for this user')
        }
    }

    private async loadGlobalRole(roleId: number): Promise<RoleWithPermissions> {
        const role = await this.roleService.findRole(roleId)
        if (!role || role.scope !== 'global') {
            throw new BadRequestException('Unknown role')
        }

        return role
    }

    private assertRoleGrantableBy(role: RoleWithPermissions, principal: UserWithRole, ability: AppAbility): void {
        if (role.type === 'super_admin' && principal.role.type !== 'super_admin') {
            throw new ForbiddenException('Only super admins can assign the super admin role')
        }

        assertRoleGrantable(role.permissions.filter(isGlobalPermission), (permission) =>
            holdsPermission(ability, permission),
        )
    }

    private async assertNotLastSuperAdmin(): Promise<void> {
        const superAdminRole = await this.roleService.getRoleByType('super_admin')
        const superAdminCount = await this.userModel.count({ where: { roleId: superAdminRole.roleId } })

        if (superAdminCount <= 1) {
            throw new BadRequestException('The last super admin cannot be removed')
        }
    }

    private async loadUser(userId: number): Promise<UserModel> {
        const row = await this.userModel.findByPk(userId, { include: [RoleModel] })
        if (!row) {
            throw new NotFoundException('Unknown user')
        }

        return row
    }
}
