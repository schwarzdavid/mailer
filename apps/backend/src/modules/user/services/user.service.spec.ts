import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { UniqueConstraintError } from 'sequelize'
import { createMongoAbility } from '@casl/ability'
import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { UserService } from './user.service.js'
import { UserModel } from '../models/user.model.js'
import { UserPermissionModel } from '../../permission/models/user-permission.model.js'
import { RoleService } from '../../permission/services/role.service.js'
import { ProjectMemberService } from '../../permission/services/project-member.service.js'
import { PermissionCacheService } from '../../permission/services/permission-cache.service.js'
import { Role, RoleWithPermissions } from '../../permission/interfaces/role.interface.js'
import { Permission } from '../../permission/permission.constants.js'
import { AppAbility } from '../../permission/interfaces/app-ability.js'
import { FullUser, UserWithRole } from '../interfaces/user.interface.js'

const superAdminRole: RoleWithPermissions = {
    roleId: 1,
    name: 'Super Admin',
    scope: 'global',
    type: 'super_admin',
    description: null,
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
}
const adminRole: RoleWithPermissions = {
    ...superAdminRole,
    roleId: 2,
    name: 'Admin',
    type: 'admin',
    permissions: ['users.read', 'users.create', 'users.update', 'users.delete', 'settings.update'],
}
const userRole: RoleWithPermissions = { ...superAdminRole, roleId: 3, name: 'User', type: 'user' }
const viewerRole: RoleWithPermissions = {
    ...superAdminRole,
    roleId: 5,
    name: 'Viewer',
    scope: 'project',
    type: 'custom',
    permissions: ['read'],
}

const superAdminPrincipal: UserWithRole = {
    userId: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    roleId: 1,
    role: superAdminRole,
    createdAt: new Date(),
    updatedAt: new Date(),
}
const adminPrincipal: UserWithRole = {
    ...superAdminPrincipal,
    userId: 2,
    email: 'admin@example.com',
    roleId: 2,
    role: adminRole,
}

const superAdminAbility = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
const adminAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Domain' },
    { action: 'read', subject: 'Bounce' },
    { action: 'read', subject: 'User' },
    { action: 'create', subject: 'User' },
    { action: 'update', subject: 'User' },
    { action: 'delete', subject: 'User' },
    { action: 'update', subject: 'Settings' },
    { action: 'update', subject: 'User', conditions: { 'role.type': 'super_admin' }, inverted: true },
    { action: 'delete', subject: 'User', conditions: { 'role.type': 'super_admin' }, inverted: true },
])

type UserRow = UserWithRole & {
    get: (options: { plain: true }) => UserWithRole
    update: Mock<(values: Partial<FullUser>) => Promise<unknown>>
    destroy: Mock<() => Promise<void>>
}

function userRow(partial: Partial<UserWithRole> = {}): UserRow {
    const plain: UserWithRole = {
        userId: 7,
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        roleId: 3,
        role: userRole,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...partial,
    }
    const row = {
        ...plain,
        get: () => plain,
        update: vi.fn<UserRow['update']>().mockResolvedValue(undefined),
        destroy: vi.fn<UserRow['destroy']>().mockResolvedValue(undefined),
    }
    return row
}

describe('UserService', () => {
    let service: UserService
    let create: Mock<(attrs: object, options: object) => Promise<{ userId: number }>>
    let findByPk: Mock<(userId: number, options?: object) => Promise<UserRow | null>>
    let findAll: Mock<(options?: object) => Promise<UserRow[]>>
    let count: Mock<(options?: object) => Promise<number>>
    let permissionFindAll: Mock<(options: object) => Promise<{ permission: string }[]>>
    let permissionDestroy: Mock<(options: object) => Promise<number>>
    let permissionBulkCreate: Mock<(rows: object[], options?: object) => Promise<object[]>>
    let findRole: Mock<RoleService['findRole']>
    let getRoleByType: Mock<RoleService['getRoleByType']>
    let getMembershipsForUser: Mock<ProjectMemberService['getMembershipsForUser']>
    let countMembershipsPerUser: Mock<ProjectMemberService['countMembershipsPerUser']>
    let invalidateUser: Mock<PermissionCacheService['invalidateUser']>
    let transaction: Mock<Sequelize['transaction']>

    const transactionStub = {} as Transaction

    beforeEach(async () => {
        create = vi.fn<typeof create>().mockResolvedValue({ userId: 7 })
        findByPk = vi.fn<typeof findByPk>().mockResolvedValue(userRow())
        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        count = vi.fn<typeof count>().mockResolvedValue(2)
        permissionFindAll = vi.fn<typeof permissionFindAll>().mockResolvedValue([])
        permissionDestroy = vi.fn<typeof permissionDestroy>().mockResolvedValue(0)
        permissionBulkCreate = vi.fn<typeof permissionBulkCreate>().mockResolvedValue([])
        findRole = vi.fn<typeof findRole>().mockResolvedValue(userRole)
        getRoleByType = vi.fn<typeof getRoleByType>().mockResolvedValue(userRole)
        getMembershipsForUser = vi.fn<typeof getMembershipsForUser>().mockResolvedValue([])
        countMembershipsPerUser = vi.fn<typeof countMembershipsPerUser>().mockResolvedValue(new Map())
        invalidateUser = vi.fn<typeof invalidateUser>().mockResolvedValue(undefined)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UserService,
                { provide: getModelToken(UserModel), useValue: { create, findByPk, findAll, count } },
                {
                    provide: getModelToken(UserPermissionModel),
                    useValue: {
                        findAll: permissionFindAll,
                        destroy: permissionDestroy,
                        bulkCreate: permissionBulkCreate,
                    },
                },
                { provide: RoleService, useValue: { findRole, getRoleByType } },
                { provide: ProjectMemberService, useValue: { getMembershipsForUser, countMembershipsPerUser } },
                { provide: PermissionCacheService, useValue: { invalidateUser } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(UserService)
    })

    describe('createUser', () => {
        it('hashes the password and returns the user with its role', async () => {
            let storedPassword: string | undefined
            create.mockImplementation((attrs: object) => {
                storedPassword = (attrs as { password: string }).password
                return Promise.resolve({ userId: 7 })
            })

            const result = await service.createUser({
                firstName: 'Grace',
                lastName: 'Hopper',
                email: 'grace@example.com',
                password: 'plain-password',
                roleId: 3,
            })

            expect(storedPassword).toBeDefined()
            expect(storedPassword).not.toBe('plain-password')
            await expect(bcrypt.compare('plain-password', storedPassword!)).resolves.toBe(true)
            expect(result.role.type).toBe('user')
        })

        it('stores the email trimmed and lowercased', async () => {
            await service.createUser({
                firstName: 'Grace',
                lastName: 'Hopper',
                email: '  Grace@Example.COM ',
                password: 'plain-password',
                roleId: 3,
            })

            expect(create).toHaveBeenCalledWith(
                expect.objectContaining({ email: 'grace@example.com' }),
                expect.anything(),
            )
        })
    })

    describe('createManagedUser', () => {
        const input = {
            firstName: 'Grace',
            lastName: 'Hopper',
            email: 'grace@example.com',
            password: 'plain-password',
            roleId: 3,
            permissions: [] as Permission[],
        }

        it('creates the user with the requested role and extras in one transaction', async () => {
            await service.createManagedUser({ ...input, permissions: ['users.read'] }, adminPrincipal, adminAbility)

            expect(findRole).toHaveBeenCalledWith(3)
            expect(create).toHaveBeenCalledWith(expect.objectContaining({ roleId: 3 }), {
                returning: true,
                transaction: transactionStub,
            })
            expect(permissionBulkCreate).toHaveBeenCalledWith([{ userId: 7, permission: 'users.read' }], {
                transaction: transactionStub,
            })
        })

        it('rejects unknown and project-scoped roles', async () => {
            findRole.mockResolvedValueOnce(null).mockResolvedValueOnce(viewerRole)

            await expect(service.createManagedUser(input, adminPrincipal, adminAbility)).rejects.toThrow(
                new BadRequestException('Unknown role'),
            )
            await expect(service.createManagedUser(input, adminPrincipal, adminAbility)).rejects.toThrow(
                new BadRequestException('Unknown role'),
            )
            expect(create).not.toHaveBeenCalled()
        })

        it('blocks non-super-admins from assigning the super admin role', async () => {
            findRole.mockResolvedValue(superAdminRole)

            await expect(
                service.createManagedUser({ ...input, roleId: 1 }, adminPrincipal, adminAbility),
            ).rejects.toThrow(new ForbiddenException('Only super admins can assign the super admin role'))
            expect(create).not.toHaveBeenCalled()
        })

        it('lets super admins assign the super admin role', async () => {
            findRole.mockResolvedValue(superAdminRole)
            findByPk.mockResolvedValue(userRow({ roleId: 1, role: superAdminRole }))

            await expect(
                service.createManagedUser({ ...input, roleId: 1 }, superAdminPrincipal, superAdminAbility),
            ).resolves.toMatchObject({ role: expect.objectContaining({ type: 'super_admin' }) as Role })
        })

        it('blocks roles with permissions the caller does not hold', async () => {
            findRole.mockResolvedValue({ ...adminRole, permissions: ['roles.delete'] })

            await expect(
                service.createManagedUser({ ...input, roleId: 2 }, adminPrincipal, adminAbility),
            ).rejects.toThrow(
                new ForbiddenException('You cannot assign a role with permissions you do not hold: roles.delete'),
            )
        })

        it('blocks extras the caller does not hold and creates nothing', async () => {
            await expect(
                service.createManagedUser({ ...input, permissions: ['domains.delete'] }, adminPrincipal, adminAbility),
            ).rejects.toThrow(ForbiddenException)
            expect(transaction).not.toHaveBeenCalled()
            expect(create).not.toHaveBeenCalled()
        })

        it('maps duplicate emails to a bad request', async () => {
            create.mockRejectedValue(new UniqueConstraintError({}))

            await expect(service.createManagedUser(input, adminPrincipal, adminAbility)).rejects.toThrow(
                new BadRequestException('Email is already in use'),
            )
        })
    })

    describe('getUsers', () => {
        it('lists users with their roles', async () => {
            findAll.mockResolvedValue([userRow()])

            const users = await service.getUsers()

            expect(users).toEqual([
                expect.objectContaining({ userId: 7, role: expect.objectContaining({ type: 'user' }) as Role }),
            ])
        })

        it('adds the number of project memberships per user', async () => {
            findAll.mockResolvedValue([userRow(), userRow({ userId: 8, email: 'linus@example.com' })])
            countMembershipsPerUser.mockResolvedValue(new Map([[7, 3]]))

            const users = await service.getUsers()

            expect(countMembershipsPerUser).toHaveBeenCalledOnce()
            expect(users.map(({ userId, membershipCount }) => ({ userId, membershipCount }))).toEqual([
                { userId: 7, membershipCount: 3 },
                { userId: 8, membershipCount: 0 },
            ])
        })
    })

    describe('getUserById', () => {
        it('returns the detail with permissions and memberships', async () => {
            permissionFindAll.mockResolvedValue([{ permission: 'domains.read' }])
            getMembershipsForUser.mockResolvedValue([
                { projectId: 1, projectName: 'Acme', role: { roleId: 5, name: 'Viewer' }, permissions: ['read'] },
            ])

            const detail = await service.getUserById(7)

            expect(detail).toMatchObject({
                userId: 7,
                permissions: ['domains.read'],
                memberships: [
                    { projectId: 1, projectName: 'Acme', role: { roleId: 5, name: 'Viewer' }, permissions: ['read'] },
                ],
            })
        })

        it('throws not found for unknown users', async () => {
            findByPk.mockResolvedValue(null)

            await expect(service.getUserById(99)).rejects.toThrow(new NotFoundException('Unknown user'))
        })
    })

    describe('updateUser', () => {
        it('updates profile fields and invalidates the caches', async () => {
            const row = userRow()
            findByPk.mockResolvedValue(row)

            await service.updateUser(7, { firstName: 'Ida' }, adminPrincipal, adminAbility)

            expect(row.update).toHaveBeenCalledWith({ firstName: 'Ida' })
            expect(invalidateUser).toHaveBeenCalledWith(7)
        })

        it('stores a changed email trimmed and lowercased', async () => {
            const row = userRow()
            findByPk.mockResolvedValue(row)

            await service.updateUser(7, { email: ' Grace.Hopper@Example.com' }, adminPrincipal, adminAbility)

            expect(row.update).toHaveBeenCalledWith({ email: 'grace.hopper@example.com' })
        })

        it('hashes a new password before persisting it', async () => {
            const row = userRow()
            findByPk.mockResolvedValue(row)

            await service.updateUser(7, { password: 'new-password-123' }, adminPrincipal, adminAbility)

            const changes = row.update.mock.calls[0]![0]
            expect(changes.password).toBeDefined()
            expect(changes.password).not.toBe('new-password-123')
            await expect(bcrypt.compare('new-password-123', changes.password!)).resolves.toBe(true)
        })

        it('forbids admins from updating super admins', async () => {
            findByPk.mockResolvedValue(userRow({ roleId: 1, role: superAdminRole }))

            await expect(service.updateUser(7, { firstName: 'X' }, adminPrincipal, adminAbility)).rejects.toThrow(
                ForbiddenException,
            )
        })

        it('forbids non-super-admins from promoting to super admin', async () => {
            findRole.mockResolvedValue(superAdminRole)

            await expect(service.updateUser(7, { roleId: 1 }, adminPrincipal, adminAbility)).rejects.toThrow(
                new ForbiddenException('Only super admins can assign the super admin role'),
            )
        })

        it('blocks a role change to a role with permissions the caller does not hold', async () => {
            findRole.mockResolvedValue({ ...adminRole, permissions: ['roles.delete'] })

            await expect(service.updateUser(7, { roleId: 2 }, adminPrincipal, adminAbility)).rejects.toThrow(
                ForbiddenException,
            )
        })

        it('rejects a project role on a user', async () => {
            findRole.mockResolvedValue(viewerRole)

            await expect(service.updateUser(7, { roleId: 5 }, adminPrincipal, adminAbility)).rejects.toThrow(
                new BadRequestException('Unknown role'),
            )
        })

        it('blocks demoting the last super admin', async () => {
            findByPk.mockResolvedValue(userRow({ userId: 1, roleId: 1, role: superAdminRole }))
            findRole.mockResolvedValue(adminRole)
            getRoleByType.mockResolvedValue(superAdminRole)
            count.mockResolvedValue(1)

            await expect(service.updateUser(1, { roleId: 2 }, superAdminPrincipal, superAdminAbility)).rejects.toThrow(
                new BadRequestException('The last super admin cannot be removed'),
            )
        })

        it('allows demoting a super admin while another remains', async () => {
            const row = userRow({ userId: 5, roleId: 1, role: superAdminRole })
            findByPk.mockResolvedValue(row)
            findRole.mockResolvedValue(adminRole)
            getRoleByType.mockResolvedValue(superAdminRole)
            count.mockResolvedValue(2)

            await service.updateUser(5, { roleId: 2 }, superAdminPrincipal, superAdminAbility)

            expect(row.update).toHaveBeenCalledWith({ roleId: 2 })
        })

        it('maps duplicate emails to a bad request without invalidating the cache', async () => {
            const row = userRow()
            row.update.mockRejectedValue(new UniqueConstraintError({}))
            findByPk.mockResolvedValue(row)

            await expect(
                service.updateUser(7, { email: 'taken@example.com' }, adminPrincipal, adminAbility),
            ).rejects.toThrow(new BadRequestException('Email is already in use'))
            expect(invalidateUser).not.toHaveBeenCalled()
        })

        it('rethrows unexpected persistence errors', async () => {
            const row = userRow()
            row.update.mockRejectedValue(new Error('connection lost'))
            findByPk.mockResolvedValue(row)

            await expect(service.updateUser(7, { firstName: 'Ida' }, adminPrincipal, adminAbility)).rejects.toThrow(
                'connection lost',
            )
        })

        it('throws not found for unknown users', async () => {
            findByPk.mockResolvedValue(null)

            await expect(service.updateUser(99, { firstName: 'Ida' }, adminPrincipal, adminAbility)).rejects.toThrow(
                new NotFoundException('Unknown user'),
            )
        })

        it('leaves a forbidden target untouched', async () => {
            const row = userRow({ roleId: 1, role: superAdminRole })
            findByPk.mockResolvedValue(row)

            await expect(
                service.updateUser(7, { password: 'hijacked-password' }, adminPrincipal, adminAbility),
            ).rejects.toThrow(ForbiddenException)
            expect(row.update).not.toHaveBeenCalled()
            expect(invalidateUser).not.toHaveBeenCalled()
        })

        it('skips the role lookup when the role does not change', async () => {
            const row = userRow()
            findByPk.mockResolvedValue(row)

            await service.updateUser(7, { roleId: 3, lastName: 'Murray' }, adminPrincipal, adminAbility)

            expect(findRole).not.toHaveBeenCalled()
            expect(row.update).toHaveBeenCalledWith({ lastName: 'Murray' })
        })

        it('rejects an unknown role without persisting anything', async () => {
            const row = userRow()
            findByPk.mockResolvedValue(row)
            findRole.mockResolvedValue(null)

            await expect(service.updateUser(7, { roleId: 42 }, adminPrincipal, adminAbility)).rejects.toThrow(
                new BadRequestException('Unknown role'),
            )
            expect(row.update).not.toHaveBeenCalled()
        })

        it('returns the reloaded user with its role', async () => {
            const row = userRow()
            const reloaded = userRow({ firstName: 'Ida' })
            findByPk.mockResolvedValueOnce(row).mockResolvedValueOnce(reloaded)

            const result = await service.updateUser(7, { firstName: 'Ida' }, adminPrincipal, adminAbility)

            expect(findByPk).toHaveBeenLastCalledWith(7, expect.objectContaining({ rejectOnEmpty: true }))
            expect(result.firstName).toBe('Ida')
        })
    })

    describe('deleteUser', () => {
        it('deletes the user and invalidates the caches', async () => {
            const row = userRow()
            findByPk.mockResolvedValue(row)

            await service.deleteUser(7, adminPrincipal, adminAbility)

            expect(row.destroy).toHaveBeenCalledOnce()
            expect(invalidateUser).toHaveBeenCalledWith(7)
        })

        it('blocks self-deletion', async () => {
            await expect(service.deleteUser(2, adminPrincipal, adminAbility)).rejects.toThrow(
                new BadRequestException('You cannot delete yourself'),
            )
        })

        it('forbids admins from deleting super admins', async () => {
            findByPk.mockResolvedValue(userRow({ roleId: 1, role: superAdminRole }))

            await expect(service.deleteUser(7, adminPrincipal, adminAbility)).rejects.toThrow(ForbiddenException)
        })

        it('leaves a forbidden target in place', async () => {
            const row = userRow({ roleId: 1, role: superAdminRole })
            findByPk.mockResolvedValue(row)

            await expect(service.deleteUser(7, adminPrincipal, adminAbility)).rejects.toThrow(ForbiddenException)
            expect(row.destroy).not.toHaveBeenCalled()
            expect(invalidateUser).not.toHaveBeenCalled()
        })

        it('throws not found for unknown users', async () => {
            findByPk.mockResolvedValue(null)

            await expect(service.deleteUser(99, adminPrincipal, adminAbility)).rejects.toThrow(
                new NotFoundException('Unknown user'),
            )
        })

        it('blocks deleting the last super admin', async () => {
            findByPk.mockResolvedValue(userRow({ userId: 5, roleId: 1, role: superAdminRole }))
            getRoleByType.mockResolvedValue(superAdminRole)
            count.mockResolvedValue(1)

            await expect(service.deleteUser(5, superAdminPrincipal, superAdminAbility)).rejects.toThrow(
                new BadRequestException('The last super admin cannot be removed'),
            )
        })

        it('allows deleting a super admin while another remains', async () => {
            const row = userRow({ userId: 5, roleId: 1, role: superAdminRole })
            findByPk.mockResolvedValue(row)
            getRoleByType.mockResolvedValue(superAdminRole)
            count.mockResolvedValue(2)

            await service.deleteUser(5, superAdminPrincipal, superAdminAbility)

            expect(row.destroy).toHaveBeenCalledOnce()
            expect(invalidateUser).toHaveBeenCalledWith(5)
        })
    })

    describe('replaceUserPermissions', () => {
        it('replaces the rows deduplicated inside a transaction', async () => {
            const result = await service.replaceUserPermissions(
                7,
                ['domains.read', 'domains.read', 'bounces.read'],
                adminAbility,
            )

            expect(permissionDestroy).toHaveBeenCalledWith({ where: { userId: 7 }, transaction: transactionStub })
            expect(permissionBulkCreate).toHaveBeenCalledWith(
                [
                    { userId: 7, permission: 'domains.read' },
                    { userId: 7, permission: 'bounces.read' },
                ],
                { transaction: transactionStub },
            )
            expect(invalidateUser).toHaveBeenCalledWith(7)
            expect(result).toEqual(['domains.read', 'bounces.read'])
        })

        it('forbids editing super admin grants for non-super-admins', async () => {
            findByPk.mockResolvedValue(userRow({ roleId: 1, role: superAdminRole }))

            await expect(service.replaceUserPermissions(7, ['domains.read'], adminAbility)).rejects.toThrow(
                ForbiddenException,
            )
        })

        it('keeps the existing grants when the caller is forbidden', async () => {
            findByPk.mockResolvedValue(userRow({ roleId: 1, role: superAdminRole }))

            await expect(service.replaceUserPermissions(7, [], adminAbility)).rejects.toThrow(ForbiddenException)
            expect(permissionDestroy).not.toHaveBeenCalled()
            expect(invalidateUser).not.toHaveBeenCalled()
        })

        it('revokes every direct grant for an empty list', async () => {
            const result = await service.replaceUserPermissions(7, [], adminAbility)

            expect(permissionDestroy).toHaveBeenCalledWith({ where: { userId: 7 }, transaction: transactionStub })
            expect(permissionBulkCreate).toHaveBeenCalledWith([], { transaction: transactionStub })
            expect(result).toEqual([])
        })

        it('does not invalidate the cache when the transaction fails', async () => {
            permissionBulkCreate.mockRejectedValue(new Error('constraint violated'))

            await expect(service.replaceUserPermissions(7, ['domains.read'], adminAbility)).rejects.toThrow(
                'constraint violated',
            )
            expect(invalidateUser).not.toHaveBeenCalled()
        })

        it('throws not found for unknown users', async () => {
            findByPk.mockResolvedValue(null)

            await expect(service.replaceUserPermissions(99, ['domains.read'], adminAbility)).rejects.toThrow(
                new NotFoundException('Unknown user'),
            )
        })

        it('forbids granting a permission the caller does not hold', async () => {
            await expect(
                service.replaceUserPermissions(7, ['domains.read', 'domains.delete', 'projects.all'], adminAbility),
            ).rejects.toThrow(
                new ForbiddenException(
                    'You cannot grant or revoke permissions you do not hold: domains.delete, projects.all',
                ),
            )
            expect(permissionDestroy).not.toHaveBeenCalled()
            expect(permissionBulkCreate).not.toHaveBeenCalled()
            expect(invalidateUser).not.toHaveBeenCalled()
        })

        it('forbids a caller with users.update from granting themselves extra permissions', async () => {
            findByPk.mockResolvedValue(userRow({ userId: 2, roleId: 2, role: adminRole }))

            await expect(
                service.replaceUserPermissions(2, ['users.delete', 'roles.read'], adminAbility),
            ).rejects.toThrow(ForbiddenException)
            expect(permissionBulkCreate).not.toHaveBeenCalled()
        })

        it('forbids revoking a permission the caller does not hold', async () => {
            permissionFindAll.mockResolvedValue([{ permission: 'domains.delete' }])

            await expect(service.replaceUserPermissions(7, [], adminAbility)).rejects.toThrow(ForbiddenException)
            expect(permissionDestroy).not.toHaveBeenCalled()
        })

        it('keeps an existing grant the caller does not hold when it is left unchanged', async () => {
            permissionFindAll.mockResolvedValue([{ permission: 'domains.delete' }])

            await expect(
                service.replaceUserPermissions(7, ['domains.delete', 'domains.read'], adminAbility),
            ).resolves.toEqual(['domains.delete', 'domains.read'])
            expect(permissionFindAll).toHaveBeenCalledWith({ where: { userId: 7 } })
        })

        it('does not treat project-scoped access as holding projects.all', async () => {
            const memberAbility = createMongoAbility<AppAbility>([
                { action: 'update', subject: 'User' },
                { action: 'read', subject: 'Project', conditions: { projectId: { $in: [4] } } },
                { action: 'update', subject: 'Project', conditions: { projectId: { $in: [4] } } },
                { action: 'delete', subject: 'Project', conditions: { projectId: { $in: [4] } } },
            ])

            await expect(service.replaceUserPermissions(7, ['projects.all'], memberAbility)).rejects.toThrow(
                ForbiddenException,
            )
        })

        it('lets super admins grant any permission', async () => {
            await expect(
                service.replaceUserPermissions(7, ['settings.update', 'projects.all'], superAdminAbility),
            ).resolves.toEqual(['settings.update', 'projects.all'])
        })
    })
})
