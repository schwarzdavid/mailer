import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { PoliciesGuard } from './policies.guard'
import { AbilityFactory } from '../services/ability-factory.service'
import { AppAbility } from '../interfaces/app-ability'
import { User } from '../../user/interfaces/user.interface'

const user: User = {
    userId: 5,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    roleId: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
}

function contextFor(request: { user?: User; ability?: AppAbility }): ExecutionContext {
    return {
        getHandler: () => vi.fn(),
        getClass: () => vi.fn(),
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext
}

describe('PoliciesGuard', () => {
    let guard: PoliciesGuard
    let getAllAndOverride: Mock<Reflector['getAllAndOverride']>
    let createForUser: Mock<AbilityFactory['createForUser']>

    const ability = createMongoAbility<AppAbility>([{ action: 'read', subject: 'Domain' }])

    beforeEach(() => {
        getAllAndOverride = vi.fn<typeof getAllAndOverride>()
        createForUser = vi.fn<typeof createForUser>().mockResolvedValue(ability)

        const reflector = { getAllAndOverride } as unknown as Reflector
        const factory = { createForUser } as unknown as AbilityFactory

        guard = new PoliciesGuard(reflector, factory)
    })

    it('passes public routes without building an ability', async () => {
        getAllAndOverride.mockReturnValueOnce(true)

        await expect(guard.canActivate(contextFor({}))).resolves.toBe(true)
        expect(createForUser).not.toHaveBeenCalled()
    })

    it('attaches the ability and passes when no requirement is set', async () => {
        getAllAndOverride.mockReturnValueOnce(undefined).mockReturnValueOnce(undefined)
        const request: { user?: User; ability?: AppAbility } = { user }

        await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
        expect(request.ability).toBe(ability)
    })

    it('passes when every requirement is satisfied', async () => {
        getAllAndOverride.mockReturnValueOnce(undefined).mockReturnValueOnce([{ action: 'read', subject: 'Domain' }])

        await expect(guard.canActivate(contextFor({ user }))).resolves.toBe(true)
    })

    it('rejects when a requirement is not satisfied', async () => {
        getAllAndOverride.mockReturnValueOnce(undefined).mockReturnValueOnce([{ action: 'create', subject: 'Domain' }])

        await expect(guard.canActivate(contextFor({ user }))).resolves.toBe(false)
    })

    it('rejects requests without a user', async () => {
        getAllAndOverride.mockReturnValueOnce(undefined)

        await expect(guard.canActivate(contextFor({}))).resolves.toBe(false)
    })
})
