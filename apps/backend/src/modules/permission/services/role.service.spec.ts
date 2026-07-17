import { BadRequestException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { RoleService } from './role.service'
import { RoleModel } from '../models/role.model'
import { RolePermissionModel } from '../models/role-permission.model'
import { Role } from '../interfaces/role.interface'
import { Permission } from '../permission.constants'

const role: Role = {
    roleId: 2,
    name: 'Admin',
    type: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
}

type RoleRow = Role & { permissions?: { permission: Permission }[] } & {
    get: (options: { plain: true }) => Role & { permissions?: { permission: Permission }[] }
}

function roleRow(partial: Partial<Role> = {}, permissions: Permission[] = []): RoleRow {
    const plain = { ...role, ...partial, permissions: permissions.map((permission) => ({ permission })) }
    return { ...plain, get: () => plain }
}

describe('RoleService', () => {
    let service: RoleService
    let findAll: Mock<(options?: object) => Promise<RoleRow[]>>
    let findByPk: Mock<(roleId: number) => Promise<RoleRow | null>>
    let findOne: Mock<(options: object) => Promise<RoleRow | null>>

    beforeEach(async () => {
        findAll = vi.fn<typeof findAll>().mockResolvedValue([])
        findByPk = vi.fn<typeof findByPk>()
        findOne = vi.fn<typeof findOne>()

        const module: TestingModule = await Test.createTestingModule({
            providers: [RoleService, { provide: getModelToken(RoleModel), useValue: { findAll, findByPk, findOne } }],
        }).compile()

        service = module.get(RoleService)
    })

    it('lists roles with their permissions', async () => {
        findAll.mockResolvedValue([roleRow({}, ['users.read'])])

        const roles = await service.getRoles()

        expect(findAll).toHaveBeenCalledWith({ include: [RolePermissionModel] })
        expect(roles).toEqual([expect.objectContaining({ roleId: 2, name: 'Admin', permissions: ['users.read'] })])
    })

    it('returns a role by id', async () => {
        findByPk.mockResolvedValue(roleRow())

        await expect(service.getRoleById(2)).resolves.toEqual(expect.objectContaining({ roleId: 2 }))
    })

    it('rejects unknown role ids', async () => {
        findByPk.mockResolvedValue(null)

        await expect(service.getRoleById(99)).rejects.toThrow(new BadRequestException('Unknown role'))
    })

    it('resolves a role by type', async () => {
        findOne.mockResolvedValue(roleRow({ roleId: 1, name: 'Super Admin', type: 'super_admin' }))

        const found = await service.getRoleByType('super_admin')

        expect(findOne).toHaveBeenCalledWith({ where: { type: 'super_admin' }, rejectOnEmpty: true })
        expect(found.type).toBe('super_admin')
    })
})
