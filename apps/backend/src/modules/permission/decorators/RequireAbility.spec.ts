import 'reflect-metadata'
import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { createMongoAbility } from '@casl/ability'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ABILITY_KEY, RequireAbility } from './RequireAbility.js'
import { Public } from '../../auth/decorators/Public.js'
import { PoliciesGuard } from '../guards/policies.guard.js'
import { AbilityFactory } from '../services/ability-factory.service.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { User } from '../../user/interfaces/user.interface.js'

const user: User = {
    userId: 5,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    roleId: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
}

@RequireAbility({ action: 'read', subject: 'Domain' })
class DomainProbe {
    inherited(this: void) {}

    @RequireAbility({ action: 'delete', subject: 'Domain' })
    remove(this: void) {}

    @RequireAbility({ action: 'read', subject: 'Domain' }, { action: 'update', subject: 'Settings' })
    combined(this: void) {}

    @Public()
    open(this: void) {}
}

function contextFor(handler: () => void, request: { user?: User; ability?: AppAbility }): ExecutionContext {
    return {
        getHandler: () => handler,
        getClass: () => DomainProbe,
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext
}

describe('RequireAbility', () => {
    it('stores every requirement on the decorated handler', () => {
        expect(Reflect.getMetadata(ABILITY_KEY, DomainProbe.prototype.combined)).toEqual([
            { action: 'read', subject: 'Domain' },
            { action: 'update', subject: 'Settings' },
        ])
    })

    it('stores class-level requirements on the controller', () => {
        expect(Reflect.getMetadata(ABILITY_KEY, DomainProbe)).toEqual([{ action: 'read', subject: 'Domain' }])
    })

    describe('enforced by the PoliciesGuard', () => {
        let guard: PoliciesGuard
        let createForUser: Mock<AbilityFactory['createForUser']>

        beforeEach(() => {
            createForUser = vi
                .fn<typeof createForUser>()
                .mockResolvedValue(createMongoAbility<AppAbility>([{ action: 'read', subject: 'Domain' }]))
            guard = new PoliciesGuard(new Reflector(), { createForUser } as unknown as AbilityFactory)
        })

        it('applies the class requirement to handlers without their own', async () => {
            await expect(guard.canActivate(contextFor(DomainProbe.prototype.inherited, { user }))).resolves.toBe(true)
        })

        it('lets a handler requirement override the class requirement', async () => {
            await expect(guard.canActivate(contextFor(DomainProbe.prototype.remove, { user }))).resolves.toBe(false)
        })

        it('requires every listed ability', async () => {
            await expect(guard.canActivate(contextFor(DomainProbe.prototype.combined, { user }))).resolves.toBe(false)
        })

        it('skips ability checks on public handlers', async () => {
            await expect(guard.canActivate(contextFor(DomainProbe.prototype.open, {}))).resolves.toBe(true)
            expect(createForUser).not.toHaveBeenCalled()
        })
    })
})
