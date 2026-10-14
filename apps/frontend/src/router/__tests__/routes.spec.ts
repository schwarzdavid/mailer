import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AbilityRuleDto, SetupStatusDto, UserDto } from 'api'
import { router } from '@/router'
import { RouteNames } from '@/router/RouteNames.ts'
import { JWT_KEY } from '@/constants/jwtKey.ts'

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
    step?: SetupStatusDto['step'] | Error
    user?: UserDto | Error
    rules?: AbilityRuleDto[] | Error
}

function status(step: SetupStatusDto['step']): SetupStatusDto {
    return { step, needsSetup: step !== 'finished' }
}

async function freshRouter(scenario: Scenario) {
    vi.resetModules()
    const api = await import('api')
    const getStatus = vi.spyOn(api.SetupApi, 'getStatus')
    const currentUser = vi.spyOn(api.AuthApi, 'currentUser')
    const getAbility = vi.spyOn(api.AuthApi, 'getAbility')

    const { step = 'finished', user: authenticated = user, rules = [] } = scenario
    if (step instanceof Error) {
        getStatus.mockRejectedValue(step)
    } else {
        getStatus.mockResolvedValue(status(step))
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
    localStorage.clear()
})

describe('router', () => {
    it('registers a route for every route name', () => {
        for (const name of Object.values(RouteNames)) {
            expect(router.hasRoute(name)).toBe(true)
        }
    })

    describe('setup guard', () => {
        it.each(['/', '/login', '/domains', '/users/3'])('sends %s to setup while no account exists', async (path) => {
            const { landed, currentUser } = await navigate({ step: 'account' }, path)

            expect(landed).toBe(RouteNames.ONBOARDING)
            expect(currentUser).not.toHaveBeenCalled()
        })

        it('redirects the old onboarding URL to setup', async () => {
            const { router: fresh, landed } = await navigate({ step: 'account' }, '/onboarding')

            expect(landed).toBe(RouteNames.ONBOARDING)
            expect(fresh.currentRoute.value.path).toBe('/setup')
        })

        it.each(['sendingDomain', 'records'] as const)(
            'resumes a signed-in admin at setup while on the %s step',
            async (step) => {
                const { landed } = await navigate({ step }, '/projects')

                expect(landed).toBe(RouteNames.ONBOARDING)
            },
        )

        it('asks a signed-out admin to log in before resuming setup', async () => {
            const { landed } = await navigate({ step: 'records', user: new Error('Unauthorized') }, '/setup')

            expect(landed).toBe(RouteNames.LOGIN)
        })

        it('keeps the login reachable during setup', async () => {
            const { landed, currentUser } = await navigate({ step: 'sendingDomain' }, '/login')

            expect(landed).toBe(RouteNames.LOGIN)
            expect(currentUser).not.toHaveBeenCalled()
        })

        it('closes setup once it is finished', async () => {
            const { landed } = await navigate({ step: 'finished' }, '/setup')

            expect(landed).toBe(RouteNames.DASHBOARD)
        })

        it('treats an unreachable setup status as finished', async () => {
            const { landed } = await navigate({ step: new Error('offline') }, '/')

            expect(landed).toBe(RouteNames.DASHBOARD)
            expect(console.error).toHaveBeenCalled()
        })

        it('asks for the setup status only once per session', async () => {
            const { router: fresh, getStatus } = await freshRouter({})

            await fresh.push('/')
            await fresh.push('/projects')

            expect(getStatus).toHaveBeenCalledTimes(1)
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

        it('marks the session as expired when a stored token was rejected', async () => {
            localStorage.setItem(JWT_KEY, 'stale-token')
            const { router: fresh } = await navigate({ user: new Error('Unauthorized') }, '/projects')

            expect(fresh.currentRoute.value.query).toEqual({ redirect: '/projects', expired: '1' })
            expect(localStorage.getItem(JWT_KEY)).toBeNull()
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

        it('shows unknown URLs inside the shell', async () => {
            const { landed } = await navigate({}, '/does/not/exist')

            expect(landed).toBe(RouteNames.NOT_FOUND)
        })
    })

    describe('permission metadata', () => {
        it.each([
            ['/domains', 'Domain', 'domains'],
            ['/domains/5', 'Domain', 'domains'],
            ['/bounces', 'Bounce', 'bounces'],
            ['/bounces/blocked', 'Bounce', 'bounces'],
            ['/settings', 'Settings', 'settings'],
            ['/users', 'User', 'users'],
            ['/users/3', 'User', 'users'],
        ])('keeps %s open so the shell can explain a missing %s permission', async (path, subject, section) => {
            const { router: fresh } = await navigate({ rules: [{ action: ['read'], subject: 'Project' }] }, path)

            expect(fresh.currentRoute.value.meta.ability).toEqual({ action: 'read', subject })
            expect(fresh.currentRoute.value.meta.section).toBe(section)
        })

        it.each([
            ['/', 'dashboard'],
            ['/projects', 'projects'],
            ['/projects/4', 'projects'],
            ['/forms/9', 'projects'],
            ['/forms/9/receivers/2/template', 'projects'],
        ])('highlights the right section for %s', async (path, section) => {
            const { router: fresh } = await navigate({}, path)

            expect(fresh.currentRoute.value.meta.section).toBe(section)
        })
    })
})
