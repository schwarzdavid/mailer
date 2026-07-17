import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { subject } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { AbilityFactory, PermissionInputs } from './ability-factory.service'
import { RoleModel } from '../models/role.model'
import { RolePermissionModel } from '../models/role-permission.model'
import { UserPermissionModel } from '../models/user-permission.model'
import { ProjectMemberModel } from '../models/project-member.model'
import { User } from '../../user/interfaces/user.interface'
import { Permission, ProjectPermission, RoleType } from '../permission.constants'

const user: User = {
    userId: 5,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    roleId: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('AbilityFactory', () => {
    let factory: AbilityFactory
    let cacheGet: Mock<(key: string) => Promise<PermissionInputs | undefined>>
    let cacheSet: Mock<(key: string, value: PermissionInputs) => Promise<void>>
    let roleFindByPk: Mock<(roleId: number, options: object) => Promise<{ type: RoleType }>>
    let rolePermissionFindAll: Mock<(options: object) => Promise<{ permission: Permission }[]>>
    let userPermissionFindAll: Mock<(options: object) => Promise<{ permission: Permission }[]>>
    let memberFindAll: Mock<(options: object) => Promise<{ projectId: number; permission: ProjectPermission }[]>>

    function stubInputs(roleType: RoleType, permissions: Permission[], memberships: PermissionInputs['memberships']) {
        roleFindByPk.mockResolvedValue({ type: roleType })
        rolePermissionFindAll.mockResolvedValue(permissions.map((permission) => ({ permission })))
        userPermissionFindAll.mockResolvedValue([])
        memberFindAll.mockResolvedValue(memberships)
    }

    beforeEach(async () => {
        cacheGet = vi.fn<typeof cacheGet>().mockResolvedValue(undefined)
        cacheSet = vi.fn<typeof cacheSet>().mockResolvedValue(undefined)
        roleFindByPk = vi.fn<typeof roleFindByPk>()
        rolePermissionFindAll = vi.fn<typeof rolePermissionFindAll>().mockResolvedValue([])
        userPermissionFindAll = vi.fn<typeof userPermissionFindAll>().mockResolvedValue([])
        memberFindAll = vi.fn<typeof memberFindAll>().mockResolvedValue([])

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AbilityFactory,
                { provide: CACHE_MANAGER, useValue: { get: cacheGet, set: cacheSet } },
                { provide: getModelToken(RoleModel), useValue: { findByPk: roleFindByPk } },
                { provide: getModelToken(RolePermissionModel), useValue: { findAll: rolePermissionFindAll } },
                { provide: getModelToken(UserPermissionModel), useValue: { findAll: userPermissionFindAll } },
                { provide: getModelToken(ProjectMemberModel), useValue: { findAll: memberFindAll } },
            ],
        }).compile()

        factory = module.get(AbilityFactory)
    })

    it('grants super admins everything', async () => {
        stubInputs('super_admin', [], [])

        const ability = await factory.createForUser(user)

        expect(ability.can('manage', 'all')).toBe(true)
        expect(ability.can('delete', subject('User', { userId: 1, role: { type: 'super_admin' } }))).toBe(true)
    })

    it('maps stored global permissions to abilities', async () => {
        stubInputs('user', ['domains.read', 'projects.all'], [])

        const ability = await factory.createForUser(user)

        expect(ability.can('read', 'Domain')).toBe(true)
        expect(ability.can('create', 'Domain')).toBe(false)
        expect(ability.can('update', subject('Project', { projectId: 42 }))).toBe(true)
    })

    it('merges direct user permissions with role permissions', async () => {
        stubInputs('user', ['domains.read'], [])
        userPermissionFindAll.mockResolvedValue([{ permission: 'settings.read' }])

        const ability = await factory.createForUser(user)

        expect(ability.can('read', 'Domain')).toBe(true)
        expect(ability.can('read', 'Settings')).toBe(true)
    })

    it('scopes project permissions to membership rows', async () => {
        stubInputs(
            'user',
            [],
            [
                { projectId: 1, permission: 'read' },
                { projectId: 1, permission: 'update' },
                { projectId: 2, permission: 'read' },
            ],
        )

        const ability = await factory.createForUser(user)

        expect(ability.can('read', subject('Project', { projectId: 1 }))).toBe(true)
        expect(ability.can('update', subject('Project', { projectId: 1 }))).toBe(true)
        expect(ability.can('update', subject('Project', { projectId: 2 }))).toBe(false)
        expect(ability.can('read', subject('Project', { projectId: 3 }))).toBe(false)
    })

    it('forbids admins from touching super admin users', async () => {
        stubInputs('admin', ['users.update', 'users.delete', 'users.read'], [])

        const ability = await factory.createForUser(user)

        expect(ability.can('update', subject('User', { userId: 9, role: { type: 'admin' } }))).toBe(true)
        expect(ability.can('update', subject('User', { userId: 1, role: { type: 'super_admin' } }))).toBe(false)
        expect(ability.can('delete', subject('User', { userId: 1, role: { type: 'super_admin' } }))).toBe(false)
        expect(ability.can('update', 'User')).toBe(true)
    })

    it('serves permission inputs from the cache when present', async () => {
        const cached: PermissionInputs = { roleType: 'user', permissions: ['bounces.read'], memberships: [] }
        cacheGet.mockResolvedValue(cached)

        const ability = await factory.createForUser(user)

        expect(ability.can('read', 'Bounce')).toBe(true)
        expect(roleFindByPk).not.toHaveBeenCalled()
        expect(cacheGet).toHaveBeenCalledWith('auth:permissions:5')
    })

    it('caches freshly loaded inputs', async () => {
        stubInputs('user', ['bounces.read'], [])

        await factory.createForUser(user)

        expect(cacheSet).toHaveBeenCalledWith('auth:permissions:5', {
            roleType: 'user',
            permissions: ['bounces.read'],
            memberships: [],
        })
    })

    it('reports all-projects access for super admins and projects.all holders', async () => {
        stubInputs('super_admin', [], [])
        await expect(factory.hasAllProjectsAccess(user)).resolves.toBe(true)

        cacheGet.mockResolvedValue({ roleType: 'user', permissions: ['projects.all'], memberships: [] })
        await expect(factory.hasAllProjectsAccess(user)).resolves.toBe(true)

        cacheGet.mockResolvedValue({ roleType: 'user', permissions: [], memberships: [] })
        await expect(factory.hasAllProjectsAccess(user)).resolves.toBe(false)
    })

    it('lists project ids for a membership level', async () => {
        cacheGet.mockResolvedValue({
            roleType: 'user',
            permissions: [],
            memberships: [
                { projectId: 1, permission: 'read' },
                { projectId: 2, permission: 'update' },
            ],
        })

        await expect(factory.getProjectIdsFor(user, 'read')).resolves.toEqual([1])

        cacheGet.mockResolvedValue({ roleType: 'user', permissions: ['projects.all'], memberships: [] })
        await expect(factory.getProjectIdsFor(user, 'read')).resolves.toBe('all')
    })
})
