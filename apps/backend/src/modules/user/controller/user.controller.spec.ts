import { Test, TestingModule } from '@nestjs/testing'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { UserController } from './user.controller'
import { UserService } from '../services/user.service'
import { PoliciesGuard } from '../../permission/guards/policies.guard'
import { Role } from '../../permission/interfaces/role.interface'
import { AppAbility } from '../../permission/interfaces/app-ability'
import { UserDetail, UserWithRole } from '../interfaces/user.interface'

const role: Role = {
    roleId: 3,
    name: 'User',
    type: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
}

const user: UserWithRole = {
    userId: 7,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    roleId: 3,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
}

const detail: UserDetail = { ...user, permissions: ['domains.read'], memberships: [] }

const principal: UserWithRole = { ...user, userId: 1 }
const ability = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])

describe('UserController', () => {
    let controller: UserController
    let getUsers: Mock<UserService['getUsers']>
    let createManagedUser: Mock<UserService['createManagedUser']>
    let getUserById: Mock<UserService['getUserById']>
    let updateUser: Mock<UserService['updateUser']>
    let deleteUser: Mock<UserService['deleteUser']>
    let replaceUserPermissions: Mock<UserService['replaceUserPermissions']>

    beforeEach(async () => {
        getUsers = vi.fn<typeof getUsers>().mockResolvedValue([user])
        createManagedUser = vi.fn<typeof createManagedUser>().mockResolvedValue(user)
        getUserById = vi.fn<typeof getUserById>().mockResolvedValue(detail)
        updateUser = vi.fn<typeof updateUser>().mockResolvedValue(user)
        deleteUser = vi.fn<typeof deleteUser>().mockResolvedValue(undefined)
        replaceUserPermissions = vi.fn<typeof replaceUserPermissions>().mockResolvedValue(['domains.read'])

        const module: TestingModule = await Test.createTestingModule({
            controllers: [UserController],
            providers: [
                {
                    provide: UserService,
                    useValue: {
                        getUsers,
                        createManagedUser,
                        getUserById,
                        updateUser,
                        deleteUser,
                        replaceUserPermissions,
                    },
                },
            ],
        })
            .overrideGuard(PoliciesGuard)
            .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
            .compile()

        controller = module.get(UserController)
    })

    it('lists users', async () => {
        await expect(controller.getUsers()).resolves.toEqual([user])
    })

    it('creates a user through the managed flow', async () => {
        const body = { firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', password: 'password-123' }

        await expect(controller.createUser(body, principal)).resolves.toEqual(user)
        expect(createManagedUser).toHaveBeenCalledWith(body, principal)
    })

    it('returns the user detail', async () => {
        await expect(controller.getUser(7)).resolves.toEqual(detail)
        expect(getUserById).toHaveBeenCalledWith(7)
    })

    it('updates a user', async () => {
        await expect(controller.updateUser(7, { firstName: 'Ida' }, principal, ability)).resolves.toEqual(user)
        expect(updateUser).toHaveBeenCalledWith(7, { firstName: 'Ida' }, principal, ability)
    })

    it('deletes a user', async () => {
        await controller.deleteUser(7, principal, ability)

        expect(deleteUser).toHaveBeenCalledWith(7, principal, ability)
    })

    it('replaces direct permissions', async () => {
        await expect(controller.replaceUserPermissions(7, { permissions: ['domains.read'] }, ability)).resolves.toEqual(
            {
                permissions: ['domains.read'],
            },
        )
        expect(replaceUserPermissions).toHaveBeenCalledWith(7, ['domains.read'], ability)
    })
})
