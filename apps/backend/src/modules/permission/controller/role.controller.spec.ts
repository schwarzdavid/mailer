import { Test, TestingModule } from '@nestjs/testing'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { RoleController } from './role.controller.js'
import { RoleService } from '../services/role.service.js'
import { PoliciesGuard } from '../guards/policies.guard.js'
import { RoleWithPermissions } from '../interfaces/role.interface.js'
import { RoleDto } from '../dtos/role.dto.js'

const adminRole: RoleWithPermissions = {
    roleId: 2,
    name: 'Admin',
    type: 'admin',
    permissions: ['domains.read', 'users.read'],
    createdAt: new Date(),
    updatedAt: new Date(),
}

describe('RoleController', () => {
    let controller: RoleController
    let getRoles: Mock<RoleService['getRoles']>

    beforeEach(async () => {
        getRoles = vi.fn<typeof getRoles>().mockResolvedValue([adminRole])

        const module: TestingModule = await Test.createTestingModule({
            controllers: [RoleController],
            providers: [{ provide: RoleService, useValue: { getRoles } }],
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

    it('serializes roles to their public shape only', async () => {
        const [role] = await controller.getRoles()

        const serialized = instanceToPlain(plainToInstance(RoleDto, role, { excludeExtraneousValues: true }), {
            excludeExtraneousValues: true,
        })

        expect(serialized).toEqual({
            roleId: 2,
            name: 'Admin',
            type: 'admin',
            permissions: ['domains.read', 'users.read'],
        })
    })
})
