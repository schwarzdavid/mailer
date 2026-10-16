import 'reflect-metadata'
import { RequestMethod, type Type } from '@nestjs/common'
import {
    CUSTOM_ROUTE_ARGS_METADATA,
    GUARDS_METADATA,
    METHOD_METADATA,
    PATH_METADATA,
    ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'
import { PUBLIC_KEY } from './modules/auth/decorators/Public.js'
import { ABILITY_KEY, type AbilityRequirement } from './modules/permission/decorators/RequireAbility.js'
import { ApiKeyController } from './modules/api-key/controller/api-key.controller.js'
import { AuthController } from './modules/auth/controller/auth.controller.js'
import { BounceController } from './modules/bounce/controller/bounce.controller.js'
import { DomainController } from './modules/domain/controller/domain.controller.js'
import { InboundFormController } from './modules/inbound-form/controller/inbound-form.controller.js'
import { MailMessageController } from './modules/mail/controller/mail-message.controller.js'
import { PublicInboundFormController } from './modules/inbound-form/controller/public-inbound-form.controller.js'
import { PublicSendController } from './modules/api-key/controller/public-send.controller.js'
import { RoleController } from './modules/permission/controller/role.controller.js'
import { ProjectController } from './modules/project/controller/project.controller.js'
import { SettingsController } from './modules/settings/controller/settings.controller.js'
import { SetupController } from './modules/setup/controller/setup.controller.js'
import { UserController } from './modules/user/controller/user.controller.js'
import {
    LOGIN_THROTTLE_BLOCK_MS,
    LOGIN_THROTTLE_LIMIT,
    LOGIN_THROTTLE_TTL_MS,
    loginThrottleTracker,
} from './modules/auth/auth.constants.js'

interface RouteAccess {
    guards: string[]
    abilities: string[]
    scopedByPrincipal: boolean
}

const controllers: Type[] = [
    ApiKeyController,
    AuthController,
    BounceController,
    DomainController,
    InboundFormController,
    MailMessageController,
    PublicInboundFormController,
    PublicSendController,
    RoleController,
    ProjectController,
    SettingsController,
    SetupController,
    UserController,
]

function guardNames(target: object): string[] {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, target) ?? []) as Type[]
    return guards.map((guard) => guard.name)
}

function joinPath(...segments: string[]): string {
    return '/' + segments.filter((segment) => segment !== '' && segment !== '/').join('/')
}

function collectRoutes(): Record<string, RouteAccess> {
    const routes: Record<string, RouteAccess> = {}

    for (const controller of controllers) {
        const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string
        const prototype = controller.prototype as Record<string, unknown>

        for (const methodName of Object.getOwnPropertyNames(prototype)) {
            const handler = prototype[methodName]
            if (methodName === 'constructor' || typeof handler !== 'function') {
                continue
            }
            const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined
            if (path === undefined) {
                continue
            }
            const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod]
            const isPublic = (Reflect.getMetadata(PUBLIC_KEY, handler) ??
                Reflect.getMetadata(PUBLIC_KEY, controller)) as boolean | undefined
            const requirements = (Reflect.getMetadata(ABILITY_KEY, handler) ??
                Reflect.getMetadata(ABILITY_KEY, controller) ??
                []) as AbilityRequirement[]
            const routeArgs = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, methodName) ?? {}) as Record<
                string,
                unknown
            >

            routes[`${method} ${joinPath(prefix, path)}`] = {
                guards: isPublic ? ['@Public'] : [...guardNames(controller), ...guardNames(handler)],
                abilities: requirements.map(({ action, subject }) => `${action}:${subject}`),
                scopedByPrincipal: Object.keys(routeArgs).some((key) => key.includes(CUSTOM_ROUTE_ARGS_METADATA)),
            }
        }
    }

    return routes
}

const jwt = ['JwtAuthGuard', 'PoliciesGuard']
const throttled = ['ThrottlerGuard']
const apiKeyAuth = ['ThrottlerGuard', 'ApiKeyAuthGuard']

const expectedRoutes: Record<string, RouteAccess> = {
    'POST /auth/login': { guards: ['ThrottlerGuard', 'LocalAuthGuard'], abilities: [], scopedByPrincipal: true },
    'GET /auth/user': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'GET /auth/ability': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'GET /auth/permissions': { guards: jwt, abilities: [], scopedByPrincipal: true },

    'GET /project/:projectId/messages': { guards: jwt, abilities: [], scopedByPrincipal: true },

    'GET /project/:projectId/api-keys': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'POST /project/:projectId/api-keys': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'DELETE /project/:projectId/api-keys/:apiKeyId': { guards: jwt, abilities: [], scopedByPrincipal: true },

    'GET /bounce': { guards: jwt, abilities: ['read:Bounce'], scopedByPrincipal: false },
    'GET /bounce/blocked': { guards: jwt, abilities: ['read:Bounce'], scopedByPrincipal: false },
    'DELETE /bounce/blocked/:emailBlockId': { guards: jwt, abilities: ['unblock:Bounce'], scopedByPrincipal: false },

    'POST /domain': { guards: jwt, abilities: ['create:Domain'], scopedByPrincipal: false },
    'GET /domain': { guards: jwt, abilities: ['read:Domain'], scopedByPrincipal: false },
    'GET /domain/:domainId': { guards: jwt, abilities: ['read:Domain'], scopedByPrincipal: true },
    'POST /domain/:domainId/refresh': { guards: jwt, abilities: ['update:Domain'], scopedByPrincipal: false },
    'DELETE /domain/:domainId': { guards: jwt, abilities: ['delete:Domain'], scopedByPrincipal: false },

    'POST /inbound-form': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'GET /inbound-form': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'GET /inbound-form/:inboundFormId': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'PATCH /inbound-form/:inboundFormId': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'DELETE /inbound-form/:inboundFormId': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'PUT /inbound-form/:inboundFormId/fields': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'PUT /inbound-form/:inboundFormId/security': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'POST /inbound-form/:inboundFormId/receiver': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'PATCH /inbound-form/:inboundFormId/receiver/:inboundFormReceiverId': {
        guards: jwt,
        abilities: [],
        scopedByPrincipal: true,
    },
    'DELETE /inbound-form/:inboundFormId/receiver/:inboundFormReceiverId': {
        guards: jwt,
        abilities: [],
        scopedByPrincipal: true,
    },
    'GET /inbound-form/:inboundFormId/receiver/:inboundFormReceiverId/template': {
        guards: jwt,
        abilities: [],
        scopedByPrincipal: true,
    },
    'PUT /inbound-form/:inboundFormId/receiver/:inboundFormReceiverId/template/draft': {
        guards: jwt,
        abilities: [],
        scopedByPrincipal: true,
    },
    'POST /inbound-form/:inboundFormId/receiver/:inboundFormReceiverId/template/publish': {
        guards: jwt,
        abilities: [],
        scopedByPrincipal: true,
    },

    'POST /public/form/:slug': { guards: throttled, abilities: [], scopedByPrincipal: false },

    'POST /v1/send': { guards: apiKeyAuth, abilities: [], scopedByPrincipal: true },

    'GET /role': { guards: jwt, abilities: ['read:Role'], scopedByPrincipal: false },
    'GET /role/:roleId': { guards: jwt, abilities: ['read:Role'], scopedByPrincipal: false },
    'POST /role': { guards: jwt, abilities: ['create:Role'], scopedByPrincipal: true },
    'PATCH /role/:roleId': { guards: jwt, abilities: ['update:Role'], scopedByPrincipal: true },
    'DELETE /role/:roleId': { guards: jwt, abilities: ['delete:Role'], scopedByPrincipal: false },

    'POST /project': { guards: jwt, abilities: ['create:Project'], scopedByPrincipal: true },
    'GET /project': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'GET /project/deleted': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'GET /project/:projectId': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'PATCH /project/:projectId': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'DELETE /project/:projectId': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'POST /project/:projectId/restore': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'POST /project/:projectId/domains': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'DELETE /project/:projectId/domains/:domainId': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'GET /project/:projectId/members': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'GET /project/:projectId/implicit-access': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'GET /project/:projectId/roles': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'PUT /project/:projectId/members/:userId': { guards: jwt, abilities: [], scopedByPrincipal: true },
    'DELETE /project/:projectId/members/:userId': { guards: jwt, abilities: [], scopedByPrincipal: true },

    'GET /settings': { guards: jwt, abilities: ['read:Settings'], scopedByPrincipal: false },
    'PUT /settings/sending-domain': { guards: jwt, abilities: ['update:Settings'], scopedByPrincipal: false },
    'POST /settings/sending-domain/refresh': {
        guards: jwt,
        abilities: ['update:Settings'],
        scopedByPrincipal: false,
    },

    'GET /setup/status': { guards: throttled, abilities: [], scopedByPrincipal: false },
    'POST /setup/user': { guards: throttled, abilities: [], scopedByPrincipal: false },
    'POST /setup/finish': {
        guards: [...throttled, ...jwt],
        abilities: ['update:Settings'],
        scopedByPrincipal: false,
    },

    'GET /user': { guards: jwt, abilities: ['read:User'], scopedByPrincipal: false },
    'POST /user': { guards: jwt, abilities: ['create:User'], scopedByPrincipal: true },
    'GET /user/:userId': { guards: jwt, abilities: ['read:User'], scopedByPrincipal: false },
    'PATCH /user/:userId': { guards: jwt, abilities: ['update:User'], scopedByPrincipal: true },
    'DELETE /user/:userId': { guards: jwt, abilities: ['delete:User'], scopedByPrincipal: true },
    'PUT /user/:userId/permissions': { guards: jwt, abilities: ['update:User'], scopedByPrincipal: true },
}

describe('route access matrix', () => {
    const routes = collectRoutes()

    it('pins the guards and ability requirements of every HTTP route', () => {
        expect(routes).toEqual(expectedRoutes)
    })

    it('never exposes a route without any guard', () => {
        const unguarded = Object.entries(routes).filter(([, access]) => access.guards.length === 0)

        expect(unguarded).toEqual([])
    })

    it('scopes every authenticated route without an ability requirement by the caller', () => {
        const unscoped = Object.entries(routes).filter(
            ([, access]) =>
                access.guards.includes('PoliciesGuard') && access.abilities.length === 0 && !access.scopedByPrincipal,
        )

        expect(unscoped).toEqual([])
    })

    it('runs the policies guard after authentication so the ability is built for the verified user', () => {
        const misordered = Object.entries(routes).filter(([, { guards }]) => {
            const policiesIndex = guards.indexOf('PoliciesGuard')
            return policiesIndex !== -1 && guards.indexOf('JwtAuthGuard') !== policiesIndex - 1
        })

        expect(misordered).toEqual([])
    })
})

describe('route throttling', () => {
    const throttleMetadata = (key: string, controller: Type, methodName: string): unknown =>
        Reflect.getMetadata(`THROTTLER:${key}default`, (controller.prototype as Record<string, object>)[methodName]!)

    it('rate limits login attempts with the strict login budget before passport verifies them', () => {
        expect(throttleMetadata('LIMIT', AuthController, 'login')).toBe(LOGIN_THROTTLE_LIMIT)
        expect(throttleMetadata('TTL', AuthController, 'login')).toBe(LOGIN_THROTTLE_TTL_MS)
        expect(throttleMetadata('BLOCK_DURATION', AuthController, 'login')).toBe(LOGIN_THROTTLE_BLOCK_MS)
        expect(throttleMetadata('TRACKER', AuthController, 'login')).toBe(loginThrottleTracker)
    })

    it('exempts the setup status probe the router polls on every navigation', () => {
        expect(throttleMetadata('SKIP', SetupController, 'getStatus')).toBe(true)
    })

    it('moves the public send api off the default budget onto its per-key budget', () => {
        expect(throttleMetadata('SKIP', PublicSendController, 'sendMail')).toBe(true)
    })

    it('keeps throttling the first-user registration', () => {
        expect(throttleMetadata('SKIP', SetupController, 'registerUser')).toBeUndefined()
    })
})
