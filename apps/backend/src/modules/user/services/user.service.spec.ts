import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { UniqueConstraintError } from 'sequelize'
import { createMongoAbility } from '@casl/ability'
import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { UserService } from './user.service'
import { UserModel } from '../models/user.model'
import { UserPermissionModel } from '../../permission/models/user-permission.model'
import { RoleService } from '../../permission/services/role.service'
import { ProjectMemberService } from '../../permission/services/project-member.service'
import { PermissionCacheService } from '../../permission/services/permission-cache.service'
import { Role } from '../../permission/interfaces/role.interface'
import { AppAbility } from '../../permission/interfaces/app-ability'
import { FullUser, UserWithRole } from '../interfaces/user.interface'

const superAdminRole: Role = {
    roleId: 1,
    name: 'Super Admin',
    type: 'super_admin',
    createdAt: new Date(),
    updatedAt: new Date(),
}
const adminRole: Role = { ...superAdminRole, roleId: 2, name: 'Admin', type: 'admin' }
const userRole: Role = { ...superAdminRole, roleId: 3, name: 'User', type: 'user' }

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
    { action: 'read', subject: 'User' },
    { action: 'create', subject: 'User' },
    { action: 'update', subject: 'User' },
    { action: 'delete', subject: 'User' },
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
    let getRoleById: Mock<RoleService['getRoleById']>
    let getRoleByType: Mock<RoleService['getRoleByType']>
    let getMembershipsForUser: Mock<ProjectMemberService['getMembershipsForUser']>
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
        getRoleById = vi.fn<typeof getRoleById>().mockResolvedValue(userRole)
        getRoleByType = vi.fn<typeof getRoleByType>().mockResolvedValue(userRole)
        getMembershipsForUser = vi.fn<typeof getMembershipsForUser>().mockResolvedValue([])
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
                { provide: RoleService, useValue: { getRoleById, getRoleByType } },
                { provide: ProjectMemberService, useValue: { getMembershipsForUser } },
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
    })

    describe('createManagedUser', () => {
        const input = {
            firstName: 'Grace',
            lastName: 'Hopper',
            email: 'grace@example.com',
            password: 'plain-password',
        }

        it('defaults to the user role', async () => {
            await service.createManagedUser(input, adminPrincipal)

            expect(getRoleByType).toHaveBeenCalledWith('user')
            expect(create).toHaveBeenCalledWith(expect.objectContaining({ roleId: 3 }), expect.anything())
        })

        it('uses the requested role', async () => {
            getRoleById.mockResolvedValue(adminRole)

            await service.createManagedUser({ ...input, roleId: 2 }, adminPrincipal)

            expect(getRoleById).toHaveBeenCalledWith(2)
            expect(create).toHaveBeenCalledWith(expect.objectContaining({ roleId: 2 }), expect.anything())
        })

        it('blocks non-super-admins from assigning the super admin role', async () => {
            getRoleById.mockResolvedValue(superAdminRole)

            await expect(service.createManagedUser({ ...input, roleId: 1 }, adminPrincipal)).rejects.toThrow(
                ForbiddenException,
            )
            expect(create).not.toHaveBeenCalled()
        })

        it('lets super admins assign the super admin role', async () => {
            getRoleById.mockResolvedValue(superAdminRole)
            findByPk.mockResolvedValue(userRow({ roleId: 1, role: superAdminRole }))

            await expect(
                service.createManagedUser({ ...input, roleId: 1 }, superAdminPrincipal),
            ).resolves.toMatchObject({
                role: expect.objectContaining({ type: 'super_admin' }) as Role,
            })
        })

        it('maps duplicate emails to a bad request', async () => {
            create.mockRejectedValue(new UniqueConstraintError({}))

            await expect(service.createManagedUser(input, adminPrincipal)).rejects.toThrow(
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
    })

    describe('getUserById', () => {
        it('returns the detail with permissions and memberships', async () => {
            permissionFindAll.mockResolvedValue([{ permission: 'domains.read' }])
            getMembershipsForUser.mockResolvedValue([{ projectId: 1, projectName: 'Acme', permissions: ['read'] }])

            const detail = await service.getUserById(7)

            expect(detail).toMatchObject({
                userId: 7,
                permissions: ['domains.read'],
                memberships: [{ projectId: 1, projectName: 'Acme', permissions: ['read'] }],
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
            getRoleById.mockResolvedValue(superAdminRole)

            await expect(service.updateUser(7, { roleId: 1 }, adminPrincipal, adminAbility)).rejects.toThrow(
                new ForbiddenException('Only super admins can assign the super admin role'),
            )
        })

        it('blocks demoting the last super admin', async () => {
            findByPk.mockResolvedValue(userRow({ userId: 1, roleId: 1, role: superAdminRole }))
            getRoleById.mockResolvedValue(adminRole)
            getRoleByType.mockResolvedValue(superAdminRole)
            count.mockResolvedValue(1)

            await expect(service.updateUser(1, { roleId: 2 }, superAdminPrincipal, superAdminAbility)).rejects.toThrow(
                new BadRequestException('The last super admin cannot be removed'),
            )
        })

        it('allows demoting a super admin while another remains', async () => {
            const row = userRow({ userId: 5, roleId: 1, role: superAdminRole })
            findByPk.mockResolvedValue(row)
            getRoleById.mockResolvedValue(adminRole)
            getRoleByType.mockResolvedValue(superAdminRole)
            count.mockResolvedValue(2)

            await service.updateUser(5, { roleId: 2 }, superAdminPrincipal, superAdminAbility)

            expect(row.update).toHaveBeenCalledWith({ roleId: 2 })
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
    })
})
