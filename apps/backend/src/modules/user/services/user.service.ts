import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { UniqueConstraintError } from 'sequelize'
import { subject } from '@casl/ability'
import bcrypt from 'bcryptjs'
import { UserModel } from '../models/user.model'
import { FullUser, UserCreate, UserDetail, UserUpdate, UserWithRole } from '../interfaces/user.interface'
import { RoleModel } from '../../permission/models/role.model'
import { UserPermissionModel } from '../../permission/models/user-permission.model'
import { RoleService } from '../../permission/services/role.service'
import { ProjectMemberService } from '../../permission/services/project-member.service'
import { PermissionCacheService } from '../../permission/services/permission-cache.service'
import { Role } from '../../permission/interfaces/role.interface'
import { AppAbility } from '../../permission/interfaces/app-ability'
import { Permission } from '../../permission/permission.constants'

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
                email: user.email,
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

        return withRole.get({ plain: true }) as UserWithRole & { password: string }
    }

    async createManagedUser(
        user: Omit<UserCreate, 'roleId'> & { roleId?: number },
        principal: UserWithRole,
    ): Promise<UserWithRole> {
        const role =
            user.roleId === undefined
                ? await this.roleService.getRoleByType('user')
                : await this.roleService.getRoleById(user.roleId)

        this.assertRoleAssignable(role, principal)

        try {
            return await this.createUser({ ...user, roleId: role.roleId })
        } catch (error) {
            if (error instanceof UniqueConstraintError) {
                throw new BadRequestException('Email is already in use')
            }
            throw error
        }
    }

    async getUsers(): Promise<UserWithRole[]> {
        const rows = await this.userModel.findAll({ include: [RoleModel] })

        return rows.map((row) => row.get({ plain: true }) as UserWithRole & { password: string })
    }

    async getUserById(userId: number): Promise<UserDetail> {
        const row = await this.loadUser(userId)

        const [permissions, memberships] = await Promise.all([
            this.userPermissionModel.findAll({ where: { userId } }),
            this.projectMemberService.getMembershipsForUser(userId),
        ])

        return {
            ...(row.get({ plain: true }) as UserWithRole & { password: string }),
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
        const target = row.get({ plain: true }) as UserWithRole & { password: string }

        this.assertCanManage(ability, 'update', target)

        const changes: Partial<FullUser> = {}
        if (update.firstName !== undefined) {
            changes.firstName = update.firstName
        }
        if (update.lastName !== undefined) {
            changes.lastName = update.lastName
        }
        if (update.email !== undefined) {
            changes.email = update.email
        }
        if (update.password !== undefined) {
            changes.password = await bcrypt.hash(update.password, 10)
        }
        if (update.roleId !== undefined && update.roleId !== target.roleId) {
            const newRole = await this.roleService.getRoleById(update.roleId)
            this.assertRoleAssignable(newRole, principal)
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

        return reloaded.get({ plain: true }) as UserWithRole & { password: string }
    }

    async deleteUser(userId: number, principal: UserWithRole, ability: AppAbility): Promise<void> {
        if (userId === principal.userId) {
            throw new BadRequestException('You cannot delete yourself')
        }

        const row = await this.loadUser(userId)
        const target = row.get({ plain: true }) as UserWithRole & { password: string }

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
        const target = row.get({ plain: true }) as UserWithRole & { password: string }

        this.assertCanManage(ability, 'update', target)

        const uniquePermissions = [...new Set(permissions)]

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

    private assertRoleAssignable(role: Role, principal: UserWithRole): void {
        if (role.type === 'super_admin' && principal.role.type !== 'super_admin') {
            throw new ForbiddenException('Only super admins can assign the super admin role')
        }
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
