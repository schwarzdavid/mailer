import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ProjectMemberService } from './project-member.service'
import { ProjectMemberModel } from '../models/project-member.model'
import { ProjectModel } from '../../project/models/project.model'
import { UserModel } from '../../user/models/user.model'
import { PermissionCacheService } from './permission-cache.service'
import { AppAbility } from '../interfaces/app-ability'
import { ProjectMember } from '../interfaces/project-member.interface'

const userManagerAbility = createMongoAbility<AppAbility>([{ action: 'update', subject: 'User' }])

const projectEditorAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])

const readOnlyAbility = createMongoAbility<AppAbility>([
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
])

type MemberRow = ProjectMember & {
    user?: { userId: number; firstName: string; lastName: string; email: string }
    project?: { projectId: number; name: string }
} & { get: (options: { plain: true }) => object }

function memberRow(partial: Partial<MemberRow>): MemberRow {
    const plain = {
        projectMemberId: 1,
        projectId: 1,
        userId: 2,
        permission: 'read',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...partial,
    }
    return { ...plain, get: () => plain } as MemberRow
}

describe('ProjectMemberService', () => {
    let service: ProjectMemberService
    let memberFindAll: Mock<(options: object) => Promise<MemberRow[]>>
    let memberDestroy: Mock<(options: object) => Promise<number>>
    let memberBulkCreate: Mock<(rows: object[], options?: object) => Promise<object[]>>
    let projectFindByPk: Mock<(projectId: number) => Promise<object | null>>
    let userFindByPk: Mock<(userId: number) => Promise<object | null>>
    let invalidateUser: Mock<PermissionCacheService['invalidateUser']>
    let transaction: Mock<Sequelize['transaction']>

    const transactionStub = {} as Transaction

    beforeEach(async () => {
        memberFindAll = vi.fn<typeof memberFindAll>().mockResolvedValue([])
        memberDestroy = vi.fn<typeof memberDestroy>().mockResolvedValue(0)
        memberBulkCreate = vi.fn<typeof memberBulkCreate>().mockResolvedValue([])
        projectFindByPk = vi.fn<typeof projectFindByPk>().mockResolvedValue({ projectId: 1 })
        userFindByPk = vi.fn<typeof userFindByPk>().mockResolvedValue({ userId: 2 })
        invalidateUser = vi.fn<typeof invalidateUser>().mockResolvedValue(undefined)
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProjectMemberService,
                {
                    provide: getModelToken(ProjectMemberModel),
                    useValue: { findAll: memberFindAll, destroy: memberDestroy, bulkCreate: memberBulkCreate },
                },
                { provide: getModelToken(ProjectModel), useValue: { findByPk: projectFindByPk } },
                { provide: getModelToken(UserModel), useValue: { findByPk: userFindByPk } },
                { provide: PermissionCacheService, useValue: { invalidateUser } },
                { provide: Sequelize, useValue: { transaction } },
            ],
        }).compile()

        service = module.get(ProjectMemberService)
    })

    describe('getMembers', () => {
        it('groups member rows per user', async () => {
            const user = { userId: 2, firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' }
            memberFindAll.mockResolvedValue([
                memberRow({ user, permission: 'read' }),
                memberRow({ projectMemberId: 2, user, permission: 'update' }),
            ])

            const members = await service.getMembers(1, userManagerAbility)

            expect(members).toEqual([
                {
                    userId: 2,
                    firstName: 'Grace',
                    lastName: 'Hopper',
                    email: 'grace@example.com',
                    permissions: ['read', 'update'],
                },
            ])
        })

        it('allows project editors without user management rights', async () => {
            await expect(service.getMembers(1, projectEditorAbility)).resolves.toEqual([])
        })

        it('rejects members with read-only project access', async () => {
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

    describe('setMemberPermissions', () => {
        it('replaces the member rows in a transaction and invalidates the cache', async () => {
            await service.setMemberPermissions(1, 2, ['read', 'update', 'read'], userManagerAbility)

            expect(memberDestroy).toHaveBeenCalledWith({
                where: { projectId: 1, userId: 2 },
                transaction: transactionStub,
            })
            expect(memberBulkCreate).toHaveBeenCalledWith(
                [
                    { projectId: 1, userId: 2, permission: 'read' },
                    { projectId: 1, userId: 2, permission: 'update' },
                ],
                { transaction: transactionStub },
            )
            expect(invalidateUser).toHaveBeenCalledWith(2)
        })

        it('rejects unknown target users', async () => {
            userFindByPk.mockResolvedValue(null)

            await expect(service.setMemberPermissions(1, 2, ['read'], userManagerAbility)).rejects.toThrow(
                new NotFoundException('Unknown user'),
            )
        })
    })

    describe('removeMember', () => {
        it('destroys the rows and invalidates the cache', async () => {
            await service.removeMember(1, 2, projectEditorAbility)

            expect(memberDestroy).toHaveBeenCalledWith({ where: { projectId: 1, userId: 2 } })
            expect(invalidateUser).toHaveBeenCalledWith(2)
        })
    })

    describe('getMembershipsForUser', () => {
        it('groups memberships per project with the project name', async () => {
            memberFindAll.mockResolvedValue([
                memberRow({ project: { projectId: 1, name: 'Acme' }, permission: 'read' }),
                memberRow({ projectMemberId: 2, project: { projectId: 1, name: 'Acme' }, permission: 'update' }),
                memberRow({
                    projectMemberId: 3,
                    projectId: 4,
                    project: { projectId: 4, name: 'Beta' },
                    permission: 'read',
                }),
            ])

            const memberships = await service.getMembershipsForUser(2)

            expect(memberships).toEqual([
                { projectId: 1, projectName: 'Acme', permissions: ['read', 'update'] },
                { projectId: 4, projectName: 'Beta', permissions: ['read'] },
            ])
        })
    })
})
