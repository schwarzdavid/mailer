import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import { createMongoAbility } from '@casl/ability'
import { Op, Transaction } from 'sequelize'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ProjectMemberService } from './project-member.service.js'
import { RoleService } from './role.service.js'
import { PermissionCacheService } from './permission-cache.service.js'
import { AbilityFactory } from './ability-factory.service.js'
import { ProjectMemberModel } from '../models/project-member.model.js'
import { ProjectMemberPermissionModel } from '../models/project-member-permission.model.js'
import { ProjectModel } from '../../project/models/project.model.js'
import { UserModel } from '../../user/models/user.model.js'
import { RoleModel } from '../models/role.model.js'
import { RolePermissionModel } from '../models/role-permission.model.js'
import { UserPermissionModel } from '../models/user-permission.model.js'
import { RolePermission, RoleWithPermissions, UserPermission } from '../interfaces/role.interface.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { ProjectMember } from '../interfaces/project-member.interface.js'
import { ProjectPermission } from '../permission.constants.js'

const viewer: RoleWithPermissions = {
    roleId: 5,
    name: 'Viewer',
    scope: 'project',
    type: 'custom',
    description: null,
    permissions: ['read'],
    createdAt: new Date(),
    updatedAt: new Date(),
}
const maintainer: RoleWithPermissions = {
    ...viewer,
    roleId: 7,
    name: 'Maintainer',
    permissions: ['read', 'update', 'forms.manage', 'api_keys.manage', 'members.manage'],
}
const owner: RoleWithPermissions = {
    ...viewer,
    roleId: 8,
    name: 'Owner',
    permissions: ['read', 'update', 'delete', 'forms.manage', 'api_keys.manage', 'members.manage'],
}
const globalAdmin: RoleWithPermissions = { ...viewer, roleId: 2, name: 'Admin', scope: 'global', type: 'admin' }

const manageAllAbility = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
const userManagerAbility = createMongoAbility<AppAbility>([{ action: 'update', subject: 'User' }])
const memberManagerAbility = createMongoAbility<AppAbility>(
    maintainer.permissions.map((permission) => ({
        action: permission as ProjectPermission,
        subject: 'Project' as const,
        conditions: { projectId: { $in: [1] } },
    })),
)
const readOnlyAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])

type MemberRow = ProjectMember & {
    user?: { userId: number; firstName: string; lastName: string; email: string }
    project?: { projectId: number; name: string }
    role?: { roleId: number; name: string }
    permissions?: { permission: ProjectPermission }[]
}

function memberRow(partial: Partial<MemberRow>): MemberRow {
    return {
        projectMemberId: 1,
        projectId: 1,
        userId: 2,
        roleId: 5,
        role: { roleId: 5, name: 'Viewer' },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...partial,
    }
}

describe('ProjectMemberService', () => {
    let service: ProjectMemberService
    let memberFindAll: Mock<(options: object) => Promise<MemberRow[]>>
    let memberFindOne: Mock<(options: object) => Promise<MemberRow | null>>
    let memberDestroy: Mock<(options: object) => Promise<number>>
    let memberCreate: Mock<(values: object, options: object) => Promise<{ projectMemberId: number }>>
    let memberPermissionBulkCreate: Mock<(rows: object[], options?: object) => Promise<object[]>>
    let memberPermissionFindAll: Mock<(options: object) => Promise<{ permission: ProjectPermission }[]>>
    let projectFindByPk: Mock<(projectId: number, options?: object) => Promise<object | null>>
    let userFindByPk: Mock<(userId: number) => Promise<object | null>>
    let userCount: Mock<(options: object) => Promise<number>>
    let rolePermissionFindAll: Mock<(options: object) => Promise<Pick<RolePermission, 'roleId'>[]>>
    let userPermissionFindAll: Mock<(options: object) => Promise<Pick<UserPermission, 'userId'>[]>>
    let findRole: Mock<RoleService['findRole']>
    let getProjectRoles: Mock<RoleService['getProjectRoles']>
    let invalidateUser: Mock<PermissionCacheService['invalidateUser']>
    let hasAllProjectsAccess: Mock<AbilityFactory['hasAllProjectsAccess']>
    let transaction: Mock<Sequelize['transaction']>

    const transactionStub = { LOCK: Transaction.LOCK } as Transaction

    beforeEach(async () => {
        memberFindAll = vi.fn<typeof memberFindAll>().mockResolvedValue([])
        memberFindOne = vi.fn<typeof memberFindOne>().mockResolvedValue(null)
        memberDestroy = vi.fn<typeof memberDestroy>().mockResolvedValue(0)
        memberCreate = vi.fn<typeof memberCreate>().mockResolvedValue({ projectMemberId: 11 })
        memberPermissionBulkCreate = vi.fn<typeof memberPermissionBulkCreate>().mockResolvedValue([])
        memberPermissionFindAll = vi.fn<typeof memberPermissionFindAll>().mockResolvedValue([])
        projectFindByPk = vi.fn<typeof projectFindByPk>().mockResolvedValue({ projectId: 1 })
        userFindByPk = vi.fn<typeof userFindByPk>().mockResolvedValue({ userId: 2 })
        userCount = vi.fn<typeof userCount>().mockResolvedValue(0)
        rolePermissionFindAll = vi.fn<typeof rolePermissionFindAll>().mockResolvedValue([])
        userPermissionFindAll = vi.fn<typeof userPermissionFindAll>().mockResolvedValue([])
        findRole = vi.fn<typeof findRole>().mockResolvedValue(viewer)
        getProjectRoles = vi.fn<typeof getProjectRoles>().mockResolvedValue([viewer, maintainer, owner])
        invalidateUser = vi.fn<typeof invalidateUser>().mockResolvedValue(undefined)
        hasAllProjectsAccess = vi.fn<typeof hasAllProjectsAccess>().mockResolvedValue(false)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProjectMemberService,
                {
                    provide: getModelToken(ProjectMemberModel),
                    useValue: {
                        findAll: memberFindAll,
                        findOne: memberFindOne,
                        destroy: memberDestroy,
                        create: memberCreate,
                    },
                },
                {
                    provide: getModelToken(ProjectMemberPermissionModel),
                    useValue: { bulkCreate: memberPermissionBulkCreate, findAll: memberPermissionFindAll },
                },
                { provide: getModelToken(ProjectModel), useValue: { findByPk: projectFindByPk } },
                { provide: getModelToken(UserModel), useValue: { findByPk: userFindByPk, count: userCount } },
                { provide: getModelToken(RolePermissionModel), useValue: { findAll: rolePermissionFindAll } },
                { provide: getModelToken(UserPermissionModel), useValue: { findAll: userPermissionFindAll } },
                { provide: RoleService, useValue: { findRole, getProjectRoles } },
                { provide: PermissionCacheService, useValue: { invalidateUser } },
                { provide: AbilityFactory, useValue: { hasAllProjectsAccess } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(ProjectMemberService)
    })

    describe('getMembers', () => {
        it('lists members with their role and extra permissions', async () => {
            const user = { userId: 2, firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' }
            memberFindAll.mockResolvedValue([memberRow({ user, permissions: [{ permission: 'delete' }] })])

            const members = await service.getMembers(1, userManagerAbility)

            expect(memberFindAll).toHaveBeenCalledWith({
                where: { projectId: 1 },
                include: [UserModel, RoleModel, ProjectMemberPermissionModel],
                order: [['projectMemberId', 'ASC']],
            })
            expect(members).toEqual([
                {
                    userId: 2,
                    firstName: 'Grace',
                    lastName: 'Hopper',
                    email: 'grace@example.com',
                    role: { roleId: 5, name: 'Viewer' },
                    permissions: ['delete'],
                },
            ])
        })

        it('allows member managers without user management rights', async () => {
            await expect(service.getMembers(1, memberManagerAbility)).resolves.toEqual([])
        })

        it('rejects members without members.manage', async () => {
            await expect(service.getMembers(1, readOnlyAbility)).rejects.toThrow(ForbiddenException)
        })

        it('hides projects the caller cannot read', async () => {
            await expect(service.getMembers(2, readOnlyAbility)).rejects.toThrow(NotFoundException)
        })

        it('rejects unknown projects', async () => {
            projectFindByPk.mockResolvedValue(null)

            await expect(service.getMembers(1, userManagerAbility)).rejects.toThrow(
                new NotFoundException('Unknown project'),
            )
        })
    })

    describe('getProjectRoles', () => {
        it('serves the project roles to member managers only', async () => {
            await expect(service.getProjectRoles(1, memberManagerAbility)).resolves.toEqual([viewer, maintainer, owner])
            await expect(service.getProjectRoles(1, readOnlyAbility)).rejects.toThrow(ForbiddenException)
        })
    })

    describe('setMember', () => {
        it('replaces the membership with the role and extras in a transaction and invalidates the cache', async () => {
            findRole.mockResolvedValue(maintainer)

            await service.setMember(1, 2, { roleId: 7, permissions: ['delete', 'read', 'delete'] }, manageAllAbility)

            expect(projectFindByPk).toHaveBeenCalledTimes(2)
            expect(projectFindByPk).toHaveBeenLastCalledWith(1, {
                transaction: transactionStub,
                lock: transactionStub.LOCK.UPDATE,
            })
            expect(memberFindOne).toHaveBeenCalledWith({
                where: { projectId: 1, userId: 2 },
                transaction: transactionStub,
            })
            expect(memberDestroy).toHaveBeenCalledWith({
                where: { projectId: 1, userId: 2 },
                transaction: transactionStub,
            })
            expect(memberCreate).toHaveBeenCalledWith(
                { projectId: 1, userId: 2, roleId: 7 },
                { returning: true, transaction: transactionStub },
            )
            expect(memberPermissionBulkCreate).toHaveBeenCalledWith([{ projectMemberId: 11, permission: 'delete' }], {
                transaction: transactionStub,
            })
            expect(invalidateUser).toHaveBeenCalledWith(2)
        })

        it('rejects unknown target users', async () => {
            userFindByPk.mockResolvedValue(null)

            await expect(service.setMember(1, 2, { roleId: 5, permissions: [] }, userManagerAbility)).rejects.toThrow(
                new NotFoundException('Unknown user'),
            )
        })

        it('rejects adding users who already have access to all projects', async () => {
            hasAllProjectsAccess.mockResolvedValue(true)

            await expect(service.setMember(1, 2, { roleId: 5, permissions: [] }, manageAllAbility)).rejects.toThrow(
                new BadRequestException('User already has access to all projects'),
            )
            expect(hasAllProjectsAccess).toHaveBeenCalledWith({ userId: 2 })
            expect(memberDestroy).not.toHaveBeenCalled()
            expect(memberCreate).not.toHaveBeenCalled()
        })

        it('still lets existing members with access to all projects be edited', async () => {
            hasAllProjectsAccess.mockResolvedValue(true)
            memberFindOne.mockResolvedValue(memberRow({}))

            await service.setMember(1, 2, { roleId: 5, permissions: [] }, manageAllAbility)

            expect(memberCreate).toHaveBeenCalled()
        })

        it('rejects unknown and global roles', async () => {
            findRole.mockResolvedValueOnce(null).mockResolvedValueOnce(globalAdmin)

            await expect(service.setMember(1, 2, { roleId: 99, permissions: [] }, userManagerAbility)).rejects.toThrow(
                new BadRequestException('Unknown project role'),
            )
            await expect(service.setMember(1, 2, { roleId: 2, permissions: [] }, userManagerAbility)).rejects.toThrow(
                new BadRequestException('Unknown project role'),
            )
            expect(transaction).not.toHaveBeenCalled()
        })

        it('rejects a role with permissions the caller does not hold on the project', async () => {
            findRole.mockResolvedValue(owner)

            await expect(service.setMember(1, 2, { roleId: 8, permissions: [] }, memberManagerAbility)).rejects.toThrow(
                new ForbiddenException('You cannot assign a role with permissions you do not hold: delete'),
            )
            expect(memberDestroy).not.toHaveBeenCalled()
            expect(memberCreate).not.toHaveBeenCalled()
        })

        it('keeps an unchanged role the caller does not fully hold', async () => {
            memberFindOne.mockResolvedValue(memberRow({ roleId: 8, role: { roleId: 8, name: 'Owner' } }))
            findRole.mockResolvedValue(owner)

            await expect(
                service.setMember(1, 2, { roleId: 8, permissions: [] }, memberManagerAbility),
            ).resolves.toBeUndefined()
            expect(memberPermissionFindAll).toHaveBeenCalledWith({
                where: { projectMemberId: 1 },
                transaction: transactionStub,
            })
            expect(memberCreate).toHaveBeenCalledWith(
                { projectId: 1, userId: 2, roleId: 8 },
                { returning: true, transaction: transactionStub },
            )
        })

        it('rejects extras the caller does not hold on the project', async () => {
            await expect(
                service.setMember(1, 2, { roleId: 5, permissions: ['delete'] }, memberManagerAbility),
            ).rejects.toThrow(new ForbiddenException('You cannot grant or revoke permissions you do not hold: delete'))
        })

        it('rejects revoking extras the caller does not hold on the project', async () => {
            memberFindOne.mockResolvedValue(memberRow({}))
            memberPermissionFindAll.mockResolvedValue([{ permission: 'delete' }])

            await expect(service.setMember(1, 2, { roleId: 5, permissions: [] }, memberManagerAbility)).rejects.toThrow(
                ForbiddenException,
            )
        })

        it('writes nothing when the extras check fails after the role check passes', async () => {
            findRole.mockResolvedValue(maintainer)
            memberFindOne.mockResolvedValue(memberRow({}))
            memberPermissionFindAll.mockResolvedValue([{ permission: 'delete' }])

            await expect(service.setMember(1, 2, { roleId: 7, permissions: [] }, memberManagerAbility)).rejects.toThrow(
                new ForbiddenException('You cannot grant or revoke permissions you do not hold: delete'),
            )
            expect(transaction).toHaveBeenCalledOnce()
            expect(memberDestroy).not.toHaveBeenCalled()
            expect(memberCreate).not.toHaveBeenCalled()
            expect(invalidateUser).not.toHaveBeenCalled()
        })

        it('lets a users.update holder without project access change nothing they do not hold', async () => {
            findRole.mockResolvedValue(viewer)

            await expect(service.setMember(1, 2, { roleId: 5, permissions: [] }, userManagerAbility)).rejects.toThrow(
                new ForbiddenException('You cannot assign a role with permissions you do not hold: read'),
            )
        })

        it('lets member managers assign roles they fully hold', async () => {
            findRole.mockResolvedValue(maintainer)

            await service.setMember(1, 2, { roleId: 7, permissions: [] }, memberManagerAbility)

            expect(memberCreate).toHaveBeenCalledWith(
                { projectId: 1, userId: 2, roleId: 7 },
                { returning: true, transaction: transactionStub },
            )
            expect(memberPermissionBulkCreate).toHaveBeenCalledWith([], { transaction: transactionStub })
        })

        it('hides projects the caller cannot read', async () => {
            await expect(service.setMember(2, 2, { roleId: 5, permissions: [] }, memberManagerAbility)).rejects.toThrow(
                new NotFoundException('Unknown project'),
            )
        })

        it('does not invalidate the cache when the transaction fails', async () => {
            findRole.mockResolvedValue(maintainer)
            memberCreate.mockRejectedValue(new Error('constraint violated'))

            await expect(service.setMember(1, 2, { roleId: 7, permissions: [] }, memberManagerAbility)).rejects.toThrow(
                'constraint violated',
            )
            expect(invalidateUser).not.toHaveBeenCalled()
        })
    })

    describe('removeMember', () => {
        it('destroys the row and invalidates the cache', async () => {
            await service.removeMember(1, 2, memberManagerAbility)

            expect(memberDestroy).toHaveBeenCalledWith({ where: { projectId: 1, userId: 2 } })
            expect(invalidateUser).toHaveBeenCalledWith(2)
        })

        it('rejects members without members.manage', async () => {
            await expect(service.removeMember(1, 2, readOnlyAbility)).rejects.toThrow(ForbiddenException)
            expect(memberDestroy).not.toHaveBeenCalled()
        })
    })

    describe('grantFullAccess', () => {
        it('assigns the lowest role covering the whole catalog', async () => {
            await service.grantFullAccess(1, 5, transactionStub)

            expect(memberCreate).toHaveBeenCalledWith(
                { projectId: 1, userId: 5, roleId: 8 },
                { returning: true, transaction: transactionStub },
            )
            expect(memberPermissionBulkCreate).toHaveBeenCalledWith([], { transaction: transactionStub })
        })

        it('falls back to the largest role plus the missing permissions as extras', async () => {
            getProjectRoles.mockResolvedValue([viewer, maintainer])

            await service.grantFullAccess(1, 5, transactionStub)

            expect(memberCreate).toHaveBeenCalledWith(
                { projectId: 1, userId: 5, roleId: 7 },
                { returning: true, transaction: transactionStub },
            )
            expect(memberPermissionBulkCreate).toHaveBeenCalledWith([{ projectMemberId: 11, permission: 'delete' }], {
                transaction: transactionStub,
            })
        })

        it('fails loudly when no project role exists', async () => {
            getProjectRoles.mockResolvedValue([])

            await expect(service.grantFullAccess(1, 5, transactionStub)).rejects.toThrow(
                new BadRequestException('No project role is configured'),
            )
        })
    })

    describe('getMembershipsForUser', () => {
        it('lists memberships with project name, role and extras', async () => {
            memberFindAll.mockResolvedValue([
                memberRow({ project: { projectId: 1, name: 'Acme' }, permissions: [{ permission: 'delete' }] }),
                memberRow({
                    projectMemberId: 2,
                    projectId: 4,
                    roleId: 7,
                    role: { roleId: 7, name: 'Maintainer' },
                    project: { projectId: 4, name: 'Beta' },
                    permissions: [],
                }),
            ])

            const memberships = await service.getMembershipsForUser(2)

            expect(memberFindAll).toHaveBeenCalledWith({
                where: { userId: 2 },
                include: [{ model: ProjectModel, required: true }, RoleModel, ProjectMemberPermissionModel],
                order: [['projectMemberId', 'ASC']],
            })
            expect(memberships).toEqual([
                { projectId: 1, projectName: 'Acme', role: { roleId: 5, name: 'Viewer' }, permissions: ['delete'] },
                { projectId: 4, projectName: 'Beta', role: { roleId: 7, name: 'Maintainer' }, permissions: [] },
            ])
        })
    })

    describe('countMembershipsPerUser', () => {
        it('counts non-deleted project memberships per user', async () => {
            memberFindAll.mockResolvedValue([
                memberRow({ projectId: 1, userId: 2 }),
                memberRow({ projectMemberId: 2, projectId: 4, userId: 2 }),
                memberRow({ projectMemberId: 3, projectId: 4, userId: 3 }),
            ])

            const counts = await service.countMembershipsPerUser()

            expect(memberFindAll).toHaveBeenCalledWith({
                attributes: ['userId'],
                include: [{ model: ProjectModel, attributes: [], required: true }],
            })
            expect(counts).toEqual(
                new Map([
                    [2, 2],
                    [3, 1],
                ]),
            )
        })
    })

    describe('getImplicitAccess', () => {
        const superAdminQuery = {
            where: undefined,
            include: [{ model: RoleModel, attributes: [], where: { type: 'super_admin' }, required: true }],
        }

        it('counts super admins and non-super-admins holding projects.all through role or direct grant', async () => {
            rolePermissionFindAll.mockResolvedValue([{ roleId: 2 }])
            userPermissionFindAll.mockResolvedValue([{ userId: 7 }, { userId: 8 }])
            userCount.mockResolvedValueOnce(2).mockResolvedValueOnce(4)

            const access = await service.getImplicitAccess(1, memberManagerAbility)

            expect(rolePermissionFindAll).toHaveBeenCalledWith({
                attributes: ['roleId'],
                where: { permission: 'projects.all' },
            })
            expect(userPermissionFindAll).toHaveBeenCalledWith({
                attributes: ['userId'],
                where: { permission: 'projects.all' },
            })
            expect(userCount).toHaveBeenCalledWith(superAdminQuery)
            expect(userCount).toHaveBeenCalledWith({
                where: { [Op.or]: [{ roleId: { [Op.in]: [2] } }, { userId: { [Op.in]: [7, 8] } }] },
                include: [
                    { model: RoleModel, attributes: [], where: { type: { [Op.ne]: 'super_admin' } }, required: true },
                ],
            })
            expect(access).toEqual({ superAdminCount: 2, allProjectsUserCount: 4 })
        })

        it('skips the all-projects count when nobody holds the permission', async () => {
            userCount.mockResolvedValue(1)

            const access = await service.getImplicitAccess(1, userManagerAbility)

            expect(userCount).toHaveBeenCalledExactlyOnceWith(superAdminQuery)
            expect(access).toEqual({ superAdminCount: 1, allProjectsUserCount: 0 })
        })

        it('counts super admins and projects.all holders for member managers', async () => {
            userCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0)

            await expect(service.getImplicitAccess(1, memberManagerAbility)).resolves.toEqual({
                superAdminCount: 2,
                allProjectsUserCount: 0,
            })
        })

        it('rejects members without members.manage', async () => {
            await expect(service.getImplicitAccess(1, readOnlyAbility)).rejects.toThrow(ForbiddenException)
            expect(userCount).not.toHaveBeenCalled()
        })
    })
})
