import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { UniqueConstraintError } from 'sequelize'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { RoleService } from './role.service.js'
import { PermissionCacheService } from './permission-cache.service.js'
import { RoleModel } from '../models/role.model.js'
import { RolePermissionModel } from '../models/role-permission.model.js'
import { ProjectMemberModel } from '../models/project-member.model.js'
import { UserModel } from '../../user/models/user.model.js'
import { Role } from '../interfaces/role.interface.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { CatalogPermission, PROJECT_PERMISSIONS } from '../permission.constants.js'

const adminRole: Role = {
    roleId: 2,
    name: 'Admin',
    scope: 'global',
    type: 'admin',
    description: 'Everything',
    createdAt: new Date(),
    updatedAt: new Date(),
}
const superAdminRole: Role = { ...adminRole, roleId: 1, name: 'Super Admin', type: 'super_admin' }
const viewerRole: Role = { ...adminRole, roleId: 5, name: 'Viewer', scope: 'project', type: 'custom' }

type RoleRow = Role & { permissions: { permission: CatalogPermission }[] } & {
    get: (options: { plain: true }) => Role & { permissions: { permission: CatalogPermission }[] }
}

function roleRow(role: Role, permissions: CatalogPermission[] = []): RoleRow {
    const plain = { ...role, permissions: permissions.map((permission) => ({ permission })) }
    return { ...plain, get: () => plain }
}

type GroupedCount = { roleId: number; count: number }[]

const superAdminAbility = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
const roleManagerAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Role' },
    { action: 'create', subject: 'Role' },
    { action: 'update', subject: 'Role' },
    { action: 'delete', subject: 'Role' },
    { action: 'read', subject: 'User' },
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'delete', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])

describe('RoleService', () => {
    let service: RoleService
    let findAll: Mock<(options?: object) => Promise<RoleRow[]>>
    let findByPk: Mock<(roleId: number, options?: object) => Promise<RoleRow | null>>
    let findOne: Mock<(options: object) => Promise<RoleRow | null>>
    let roleCreate: Mock<(values: object, options: object) => Promise<{ roleId: number }>>
    let roleUpdate: Mock<(values: object, options: object) => Promise<[number]>>
    let roleDestroy: Mock<(options: object) => Promise<number>>
    let permissionDestroy: Mock<(options: object) => Promise<number>>
    let permissionBulkCreate: Mock<(rows: object[], options?: object) => Promise<object[]>>
    let userCount: Mock<(options?: object) => Promise<number | GroupedCount>>
    let userFindAll: Mock<(options: object) => Promise<{ userId: number }[]>>
    let memberCount: Mock<(options?: object) => Promise<number | GroupedCount>>
    let memberFindAll: Mock<(options: object) => Promise<{ userId: number }[]>>
    let invalidateUsers: Mock<PermissionCacheService['invalidateUsers']>
    let transaction: Mock<Sequelize['transaction']>

    const transactionStub = {} as Transaction

    beforeEach(async () => {
        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        findByPk = vi.fn<typeof findByPk>().mockResolvedValue(roleRow(adminRole, ['users.read']))
        findOne = vi.fn<typeof findOne>()
        roleCreate = vi.fn<typeof roleCreate>().mockResolvedValue({ roleId: 9 })
        roleUpdate = vi.fn<typeof roleUpdate>().mockResolvedValue([1])
        roleDestroy = vi.fn<typeof roleDestroy>().mockResolvedValue(1)
        permissionDestroy = vi.fn<typeof permissionDestroy>().mockResolvedValue(0)
        permissionBulkCreate = vi.fn<typeof permissionBulkCreate>().mockResolvedValue([])
        userCount = vi.fn<typeof userCount>().mockResolvedValue(0)
        userFindAll = vi.fn<typeof userFindAll>().mockResolvedValue([])
        memberCount = vi.fn<typeof memberCount>().mockResolvedValue(0)
        memberFindAll = vi.fn<typeof memberFindAll>().mockResolvedValue([])
        invalidateUsers = vi.fn<typeof invalidateUsers>().mockResolvedValue(undefined)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RoleService,
                {
                    provide: getModelToken(RoleModel),
                    useValue: {
                        findAll,
                        findByPk,
                        findOne,
                        create: roleCreate,
                        update: roleUpdate,
                        destroy: roleDestroy,
                    },
                },
                {
                    provide: getModelToken(RolePermissionModel),
                    useValue: { destroy: permissionDestroy, bulkCreate: permissionBulkCreate },
                },
                { provide: getModelToken(UserModel), useValue: { count: userCount, findAll: userFindAll } },
                {
                    provide: getModelToken(ProjectMemberModel),
                    useValue: { count: memberCount, findAll: memberFindAll },
                },
                { provide: PermissionCacheService, useValue: { invalidateUsers } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(RoleService)
    })

    describe('getRoles', () => {
        it('lists every role with permissions and its assignment count per scope', async () => {
            findAll.mockResolvedValue([roleRow(adminRole, ['users.read']), roleRow(viewerRole, ['read'])])
            userCount.mockResolvedValue([{ roleId: 2, count: 3 }])
            memberCount.mockResolvedValue([{ roleId: 5, count: 7 }])

            const roles = await service.getRoles()

            expect(findAll).toHaveBeenCalledWith({ include: [RolePermissionModel], order: [['roleId', 'ASC']] })
            expect(userCount).toHaveBeenCalledWith({ group: ['roleId'] })
            expect(memberCount).toHaveBeenCalledWith({ group: ['roleId'] })
            expect(roles).toEqual([
                expect.objectContaining({ roleId: 2, permissions: ['users.read'], assignmentCount: 3 }),
                expect.objectContaining({ roleId: 5, permissions: ['read'], assignmentCount: 7 }),
            ])
        })
    })

    describe('getRoleById', () => {
        it('returns the role with its permissions and count', async () => {
            userCount.mockResolvedValue(4)

            await expect(service.getRoleById(2)).resolves.toEqual(
                expect.objectContaining({ roleId: 2, permissions: ['users.read'], assignmentCount: 4 }),
            )
            expect(userCount).toHaveBeenCalledWith({ where: { roleId: 2 } })
        })

        it('answers unknown roles with 404', async () => {
            findByPk.mockResolvedValue(null)

            await expect(service.getRoleById(99)).rejects.toThrow(new NotFoundException('Unknown role'))
        })
    })

    describe('findRole', () => {
        it('returns null instead of throwing', async () => {
            findByPk.mockResolvedValue(null)

            await expect(service.findRole(99)).resolves.toBeNull()
        })
    })

    describe('getProjectRoles', () => {
        it('lists project-scoped roles in id order', async () => {
            findAll.mockResolvedValue([roleRow(viewerRole, ['read'])])

            await expect(service.getProjectRoles()).resolves.toEqual([
                expect.objectContaining({ roleId: 5, scope: 'project', permissions: ['read'] }),
            ])
            expect(findAll).toHaveBeenCalledWith({
                where: { scope: 'project' },
                include: [RolePermissionModel],
                order: [['roleId', 'ASC']],
            })
        })
    })

    describe('createRole', () => {
        const input = {
            name: 'Reviewer',
            scope: 'project' as const,
            description: null,
            permissions: ['read', 'read'] as CatalogPermission[],
        }

        it('creates the role and its deduplicated permissions in one transaction', async () => {
            findByPk.mockResolvedValue(roleRow({ ...viewerRole, roleId: 9, name: 'Reviewer' }, ['read']))

            const created = await service.createRole(input, superAdminAbility)

            expect(roleCreate).toHaveBeenCalledWith(
                { name: 'Reviewer', scope: 'project', type: 'custom', description: null },
                { returning: true, transaction: transactionStub },
            )
            expect(permissionBulkCreate).toHaveBeenCalledWith([{ roleId: 9, permission: 'read' }], {
                transaction: transactionStub,
            })
            expect(created).toEqual(expect.objectContaining({ roleId: 9, name: 'Reviewer' }))
        })

        it('rejects permissions outside the scope', async () => {
            await expect(
                service.createRole({ ...input, permissions: ['read', 'users.read'] }, superAdminAbility),
            ).rejects.toThrow(new BadRequestException('Permission "users.read" is not available for project roles'))
            expect(transaction).not.toHaveBeenCalled()
        })

        it('requires read on project roles', async () => {
            await expect(service.createRole({ ...input, permissions: ['delete'] }, superAdminAbility)).rejects.toThrow(
                new BadRequestException('Project roles must include the read permission'),
            )
        })

        it('requires unconditional project permissions for project roles', async () => {
            await expect(service.createRole(input, roleManagerAbility)).rejects.toThrow(ForbiddenException)
            expect(transaction).not.toHaveBeenCalled()
        })

        it('requires held global permissions for global roles', async () => {
            await expect(
                service.createRole(
                    { name: 'Ops', scope: 'global', description: null, permissions: ['users.read', 'users.delete'] },
                    roleManagerAbility,
                ),
            ).rejects.toThrow(ForbiddenException)
        })

        it('maps duplicate names to a bad request', async () => {
            roleCreate.mockRejectedValue(new UniqueConstraintError({}))

            await expect(service.createRole(input, superAdminAbility)).rejects.toThrow(
                new BadRequestException('Name is already in use'),
            )
        })
    })

    describe('updateRole', () => {
        it('replaces permissions, renames and invalidates every user holding a global role', async () => {
            findByPk.mockResolvedValue(roleRow(adminRole, ['users.read']))
            userFindAll.mockResolvedValue([{ userId: 7 }, { userId: 8 }])

            await service.updateRole(
                2,
                { name: 'Operators', permissions: ['users.read', 'users.update'] },
                superAdminAbility,
            )

            expect(roleUpdate).toHaveBeenCalledWith(
                { name: 'Operators' },
                { where: { roleId: 2 }, transaction: transactionStub },
            )
            expect(permissionDestroy).toHaveBeenCalledWith({ where: { roleId: 2 }, transaction: transactionStub })
            expect(permissionBulkCreate).toHaveBeenCalledWith(
                [
                    { roleId: 2, permission: 'users.read' },
                    { roleId: 2, permission: 'users.update' },
                ],
                { transaction: transactionStub },
            )
            expect(userFindAll).toHaveBeenCalledWith({ attributes: ['userId'], where: { roleId: 2 } })
            expect(invalidateUsers).toHaveBeenCalledWith([7, 8])
        })

        it('invalidates the distinct members holding a project role', async () => {
            findByPk.mockResolvedValue(roleRow(viewerRole, ['read']))
            memberFindAll.mockResolvedValue([{ userId: 3 }, { userId: 3 }, { userId: 4 }])

            await service.updateRole(5, { permissions: ['read', 'forms.manage'] }, superAdminAbility)

            expect(memberFindAll).toHaveBeenCalledWith({ attributes: ['userId'], where: { roleId: 5 } })
            expect(invalidateUsers).toHaveBeenCalledWith([3, 4])
        })

        it('only touches the name and description when permissions are omitted', async () => {
            userFindAll.mockResolvedValue([{ userId: 7 }])

            await service.updateRole(2, { description: 'Runs the place' }, roleManagerAbility)

            expect(roleUpdate).toHaveBeenCalledWith(
                { description: 'Runs the place' },
                { where: { roleId: 2 }, transaction: transactionStub },
            )
            expect(permissionDestroy).not.toHaveBeenCalled()
            expect(permissionBulkCreate).not.toHaveBeenCalled()
            expect(userFindAll).toHaveBeenCalledWith({ attributes: ['userId'], where: { roleId: 2 } })
            expect(invalidateUsers).toHaveBeenCalledWith([7])
        })

        it('applies the hold rule to the changed permissions only', async () => {
            findByPk.mockResolvedValue(roleRow(adminRole, ['users.read', 'users.delete']))

            await expect(service.updateRole(2, { permissions: ['users.read'] }, roleManagerAbility)).rejects.toThrow(
                ForbiddenException,
            )
            await expect(
                service.updateRole(2, { permissions: ['users.read', 'users.delete'] }, roleManagerAbility),
            ).resolves.toBeDefined()
        })

        it('requires unconditional project permissions for project roles', async () => {
            findByPk.mockResolvedValue(roleRow(viewerRole, ['read']))

            await expect(
                service.updateRole(5, { permissions: ['read', 'delete'] }, roleManagerAbility),
            ).rejects.toThrow(ForbiddenException)
        })

        it('refuses to change the super admin role', async () => {
            findByPk.mockResolvedValue(roleRow(superAdminRole))

            await expect(service.updateRole(1, { name: 'Root' }, superAdminAbility)).rejects.toThrow(
                new ForbiddenException('The super admin role cannot be changed'),
            )
        })
    })

    describe('deleteRole', () => {
        it('deletes an unassigned role', async () => {
            userCount.mockResolvedValue(0)

            await service.deleteRole(2)

            expect(roleDestroy).toHaveBeenCalledWith({ where: { roleId: 2 } })
        })

        it('refuses while users hold the role', async () => {
            userCount.mockResolvedValue(3)

            await expect(service.deleteRole(2)).rejects.toThrow(
                new BadRequestException('The role is still assigned to 3 users'),
            )
            expect(roleDestroy).not.toHaveBeenCalled()
        })

        it('refuses while project members hold the role', async () => {
            findByPk.mockResolvedValue(roleRow(viewerRole, ['read']))
            memberCount.mockResolvedValue(2)

            await expect(service.deleteRole(5)).rejects.toThrow(
                new BadRequestException('The role is still assigned to 2 project members'),
            )
        })

        it('refuses to delete the super admin role', async () => {
            findByPk.mockResolvedValue(roleRow(superAdminRole))

            await expect(service.deleteRole(1)).rejects.toThrow(ForbiddenException)
        })
    })

    it('keeps the catalog order when normalizing project permissions', async () => {
        findByPk.mockResolvedValue(roleRow({ ...viewerRole, roleId: 9 }, [...PROJECT_PERMISSIONS]))

        await service.createRole(
            { name: 'All', scope: 'project', description: null, permissions: ['members.manage', 'read'] },
            superAdminAbility,
        )

        expect(permissionBulkCreate).toHaveBeenCalledWith(
            [
                { roleId: 9, permission: 'read' },
                { roleId: 9, permission: 'members.manage' },
            ],
            { transaction: transactionStub },
        )
    })
})
