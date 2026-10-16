import { Test, TestingModule } from '@nestjs/testing'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { RoleController } from './role.controller.js'
import { RoleService } from '../services/role.service.js'
import { PoliciesGuard } from '../guards/policies.guard.js'
import { RoleSummary } from '../interfaces/role.interface.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { RoleDto } from '../dtos/role.dto.js'

const adminRole: RoleSummary = {
    roleId: 2,
    name: 'Admin',
    scope: 'global',
    type: 'admin',
    description: 'Everything',
    permissions: ['domains.read', 'users.read'],
    assignmentCount: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const ability = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])

describe('RoleController', () => {
    let controller: RoleController
    let getRoles: Mock<RoleService['getRoles']>
    let getRoleById: Mock<RoleService['getRoleById']>
    let createRole: Mock<RoleService['createRole']>
    let updateRole: Mock<RoleService['updateRole']>
    let deleteRole: Mock<RoleService['deleteRole']>

    beforeEach(async () => {
        getRoles = vi.fn<typeof getRoles>().mockResolvedValue([adminRole])
        getRoleById = vi.fn<typeof getRoleById>().mockResolvedValue(adminRole)
        createRole = vi.fn<typeof createRole>().mockResolvedValue(adminRole)
        updateRole = vi.fn<typeof updateRole>().mockResolvedValue(adminRole)
        deleteRole = vi.fn<typeof deleteRole>().mockResolvedValue(undefined)

        const module: TestingModule = await Test.createTestingModule({
            controllers: [RoleController],
            providers: [
                { provide: RoleService, useValue: { getRoles, getRoleById, createRole, updateRole, deleteRole } },
            ],
        })
            .overrideGuard(PoliciesGuard)
            .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
            .compile()

        controller = module.get(RoleController)
    })

    it('returns every role with its permissions', async () => {
        await expect(controller.getRoles()).resolves.toEqual([adminRole])
        expect(getRoles).toHaveBeenCalledOnce()
    })

    it('returns one role by id', async () => {
        await expect(controller.getRole(2)).resolves.toEqual(adminRole)
        expect(getRoleById).toHaveBeenCalledWith(2)
    })

    it('creates a role with a null description when none is given', async () => {
        await controller.createRole({ name: 'Ops', scope: 'global', permissions: ['users.read'] }, ability)

        expect(createRole).toHaveBeenCalledWith(
            { name: 'Ops', scope: 'global', description: null, permissions: ['users.read'] },
            ability,
        )
    })

    it('passes partial updates through', async () => {
        await controller.updateRole(2, { permissions: ['users.read'] }, ability)

        expect(updateRole).toHaveBeenCalledWith(2, { permissions: ['users.read'] }, ability)
    })

    it('deletes by id', async () => {
        await controller.deleteRole(2)

        expect(deleteRole).toHaveBeenCalledWith(2)
    })

    it('serializes roles to their public shape only', async () => {
        const [role] = await controller.getRoles()

        const serialized = instanceToPlain(plainToInstance(RoleDto, role, { excludeExtraneousValues: true }), {
            excludeExtraneousValues: true,
        })

        expect(serialized).toEqual({
            roleId: 2,
            name: 'Admin',
            scope: 'global',
            type: 'admin',
            description: 'Everything',
            permissions: ['domains.read', 'users.read'],
            assignmentCount: 3,
        })
    })
})
