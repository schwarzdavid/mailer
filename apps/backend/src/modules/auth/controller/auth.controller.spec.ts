import { Test, TestingModule } from '@nestjs/testing'
import { AppThrottlerGuard } from '../../throttler-storage/guards/app-throttler.guard.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMongoAbility } from '@casl/ability'
import { AuthController } from './auth.controller.js'
import { JwtHelperService } from '../services/jwt-helper.service.js'
import { PoliciesGuard } from '../../permission/guards/policies.guard.js'
import { UserWithRole } from '../../user/interfaces/user.interface.js'
import { Role } from '../../permission/interfaces/role.interface.js'
import type { AppAbility } from '../../permission/interfaces/app-ability.js'

describe('AuthController', () => {
    let controller: AuthController
    let createToken: ReturnType<typeof vi.fn>

    const role: Role = {
        roleId: 1,
        name: 'Admin',
        scope: 'global',
        type: 'admin',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    // The principal a passing LocalAuthGuard attaches to the request. Stripping it to a
    // response DTO happens in the ClassSerializerInterceptor (@ResponseDto), so that is
    // covered by DTO serialization / e2e, not these delegation-focused tests.
    const principal: UserWithRole = {
        userId: 42,
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        roleId: 1,
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    beforeEach(async () => {
        createToken = vi.fn().mockResolvedValue('signed-jwt-token')

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [{ provide: JwtHelperService, useValue: { createToken } }],
        })
            .overrideGuard(AppThrottlerGuard)
            .useValue({ canActivate: () => true })
            .overrideGuard(PoliciesGuard)
            .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
            .compile()

        controller = module.get<AuthController>(AuthController)
    })

    it('should be defined', () => {
        expect(controller).toBeDefined()
    })

    it('signs a token for the authenticated principal and returns it with the user', async () => {
        const result = await controller.login(principal)

        expect(createToken).toHaveBeenCalledWith(principal)
        expect(result.token).toBe('signed-jwt-token')
        expect(result.user).toBe(principal)
    })

    it('returns the authenticated principal from the current-user endpoint', () => {
        expect(controller.currentUser(principal)).toBe(principal)
    })

    it('serializes the caller ability rules', () => {
        const ability = createMongoAbility<AppAbility>([
            { action: 'read', subject: 'Domain' },
            {
                action: ['update', 'delete'],
                subject: 'User',
                conditions: { 'role.type': 'super_admin' },
                inverted: true,
            },
        ])

        const rules = controller.getAbility(ability)

        expect(rules).toEqual([
            { action: ['read'], subject: 'Domain', conditions: undefined, inverted: undefined },
            {
                action: ['update', 'delete'],
                subject: 'User',
                conditions: { 'role.type': 'super_admin' },
                inverted: true,
            },
        ])
    })

    it('lists the permissions the caller holds unconditionally', () => {
        const superAdmin = createMongoAbility<AppAbility>([{ action: 'manage', subject: 'all' }])
        const member = createMongoAbility<AppAbility>([
            { action: 'read', subject: 'Domain' },
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        expect(controller.getHeldPermissions(superAdmin).permissions).toContain('roles.delete')
        expect(controller.getHeldPermissions(superAdmin).projectPermissions).toEqual([
            'read',
            'update',
            'delete',
            'forms.manage',
            'api_keys.manage',
            'members.manage',
        ])
        expect(controller.getHeldPermissions(member)).toEqual({ permissions: ['domains.read'], projectPermissions: [] })
    })
})
