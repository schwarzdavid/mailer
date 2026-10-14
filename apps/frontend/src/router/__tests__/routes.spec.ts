import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AbilityRuleDto, UserDto } from 'api'
import { router } from '@/router'
import { RouteNames } from '@/router/RouteNames.ts'

const user: UserDto = {
    userId: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    role: { roleId: 2, name: 'Admin', type: 'admin' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

type Scenario = {
    needsSetup?: boolean | Error
    user?: UserDto | Error
    rules?: AbilityRuleDto[] | Error
}

async function freshRouter(scenario: Scenario) {
    vi.resetModules()
    const api = await import('api')
    const getStatus = vi.spyOn(api.SetupApi, 'getStatus')
    const currentUser = vi.spyOn(api.AuthApi, 'currentUser')
    const getAbility = vi.spyOn(api.AuthApi, 'getAbility')

    const { needsSetup = false, user: authenticated = user, rules = [] } = scenario
    if (needsSetup instanceof Error) {
        getStatus.mockRejectedValue(needsSetup)
    } else {
        getStatus.mockResolvedValue({ needsSetup })
    }
    if (authenticated instanceof Error) {
        currentUser.mockRejectedValue(authenticated)
    } else {
        currentUser.mockResolvedValue(authenticated)
    }
    if (rules instanceof Error) {
        getAbility.mockRejectedValue(rules)
    } else {
        getAbility.mockResolvedValue(rules)
    }

    const module = await import('@/router')
    return { router: module.router, getStatus, currentUser, getAbility }
}

async function navigate(scenario: Scenario, path: string) {
    const context = await freshRouter(scenario)
    await context.router.push(path)
    return { ...context, landed: context.router.currentRoute.value.name }
}

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('router', () => {
    it('registers a route for every route name', () => {
        for (const name of Object.values(RouteNames)) {
            expect(router.hasRoute(name)).toBe(true)
        }
    })

    describe('setup guard', () => {
        it.each(['/', '/login', '/domains', '/users/3'])(
            'sends %s to the onboarding while setup is pending',
            async (path) => {
                const { landed, currentUser } = await navigate({ needsSetup: true }, path)

                expect(landed).toBe(RouteNames.ONBOARDING)
                expect(currentUser).not.toHaveBeenCalled()
            },
        )

        it('keeps the onboarding reachable while setup is pending', async () => {
            const { landed } = await navigate({ needsSetup: true }, '/onboarding')

            expect(landed).toBe(RouteNames.ONBOARDING)
        })

        it('closes the onboarding once setup is done', async () => {
            const { landed } = await navigate({ needsSetup: false }, '/onboarding')

            expect(landed).toBe(RouteNames.DASHBOARD)
        })

        it('treats an unreachable setup status as completed', async () => {
            const { landed } = await navigate({ needsSetup: new Error('offline') }, '/')

            expect(landed).toBe(RouteNames.DASHBOARD)
            expect(console.error).toHaveBeenCalled()
        })

        it('asks for the setup status only once per session', async () => {
            const { router: fresh, getStatus } = await freshRouter({})

            await fresh.push('/')
            await fresh.push('/projects')

            expect(getStatus).toHaveBeenCalledTimes(1)
        })

        it('asks again after a failed setup status and honors the later answer', async () => {
            const { router: fresh, getStatus } = await freshRouter({})
            getStatus.mockRejectedValueOnce(new Error('Too Many Requests')).mockResolvedValue({ needsSetup: true })

            await fresh.push('/')
            expect(fresh.currentRoute.value.name).toBe(RouteNames.DASHBOARD)

            await fresh.push('/projects')
            expect(fresh.currentRoute.value.name).toBe(RouteNames.ONBOARDING)
            expect(getStatus).toHaveBeenCalledTimes(2)
        })
    })

    describe('authentication guard', () => {
        it('sends unauthenticated visitors of protected pages to the login', async () => {
            const { landed } = await navigate({ user: new Error('Unauthorized') }, '/projects')

            expect(landed).toBe(RouteNames.LOGIN)
        })

        it('remembers the requested page for after the login', async () => {
            const { router: fresh } = await navigate({ user: new Error('Unauthorized') }, '/users/3?tab=permissions')

            expect(fresh.currentRoute.value.query).toEqual({ redirect: '/users/3?tab=permissions' })
        })

        it('does not add a redirect for the dashboard', async () => {
            const { router: fresh, landed } = await navigate({ user: new Error('Unauthorized') }, '/')

            expect(landed).toBe(RouteNames.LOGIN)
            expect(fresh.currentRoute.value.query).toEqual({})
        })

        it('lets anyone open the login without checking the session', async () => {
            const { landed, currentUser } = await navigate({ user: new Error('Unauthorized') }, '/login')

            expect(landed).toBe(RouteNames.LOGIN)
            expect(currentUser).not.toHaveBeenCalled()
        })

        it('admits authenticated users to ungated pages', async () => {
            const { landed } = await navigate({}, '/projects/4')

            expect(landed).toBe(RouteNames.PROJECT_DETAILS)
        })
    })

    describe('permission guard', () => {
        it.each([
            ['/domains', 'Domain', RouteNames.DOMAIN_LIST],
            ['/domains/5', 'Domain', RouteNames.DOMAIN_DETAILS],
            ['/bounces', 'Bounce', RouteNames.BOUNCE_LIST],
            ['/settings', 'Settings', RouteNames.SETTINGS],
            ['/users', 'User', RouteNames.USER_LIST],
            ['/users/3', 'User', RouteNames.USER_DETAILS],
        ])('opens %s with read %s', async (path, subject, name) => {
            const { landed } = await navigate({ rules: [{ action: ['read'], subject }] }, path)

            expect(landed).toBe(name)
        })

        it.each(['/domains', '/domains/5', '/bounces', '/settings', '/users', '/users/3'])(
            'sends users without permission from %s to the dashboard',
            async (path) => {
                const { landed } = await navigate({ rules: [{ action: ['read'], subject: 'Project' }] }, path)

                expect(landed).toBe(RouteNames.DASHBOARD)
            },
        )

        it('does not let one permission open another gated page', async () => {
            const { landed } = await navigate({ rules: [{ action: ['read'], subject: 'Domain' }] }, '/users')

            expect(landed).toBe(RouteNames.DASHBOARD)
        })

        it('honors inverted rules', async () => {
            const { landed } = await navigate(
                {
                    rules: [
                        { action: ['manage'], subject: 'all' },
                        { action: ['read'], subject: 'Settings', inverted: true },
                    ],
                },
                '/settings',
            )

            expect(landed).toBe(RouteNames.DASHBOARD)
        })

        it('denies gated pages when the abilities cannot be loaded', async () => {
            const { landed } = await navigate({ rules: new Error('offline') }, '/domains')

            expect(landed).toBe(RouteNames.DASHBOARD)
        })

        it('still opens ungated pages when the abilities cannot be loaded', async () => {
            const { landed } = await navigate({ rules: new Error('offline') }, '/projects')

            expect(landed).toBe(RouteNames.PROJECT_LIST)
        })
    })
})
