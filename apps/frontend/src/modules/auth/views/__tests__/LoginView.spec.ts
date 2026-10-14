import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { AuthApi, type AuthenticationDto } from 'api'
import type { LocationQuery, Router } from 'vue-router'
import LoginView from '../LoginView.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'
import { JWT_KEY } from '@/constants/jwtKey.ts'

const { push, route } = vi.hoisted(() => {
    const route: { query: LocationQuery } = { query: {} }
    return { push: vi.fn<Router['push']>(), route }
})

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }), useRoute: () => route }
})

const authentication: AuthenticationDto = {
    token: 'jwt-token',
    user: {
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'admin@example.com',
        role: {
            type: 'super_admin',
            roleId: 1,
            name: 'Super Admin',
        },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
    route.query = {}
    localStorage.removeItem(JWT_KEY)
})

async function submitCredentials(wrapper: ReturnType<typeof mountView>) {
    await wrapper.find('input[type="email"]').setValue('admin@example.com')
    await wrapper.find('input[type="password"]').setValue('super-secret')
    await wrapper.get('form').trigger('submit')
}

describe('LoginView', () => {
    it('renders the localized heading, fields and submit button', () => {
        const wrapper = mountView(LoginView)

        expect(wrapper.get('h1').text()).toBe('Log in')
        expect(wrapper.text()).toContain('Use the account an administrator created for you.')
        expect(wrapper.find('input[type="email"]').exists()).toBe(true)
        expect(wrapper.find('input[type="password"]').exists()).toBe(true)
        expect(wrapper.get('button[type="submit"]').text()).toContain('Log in')
    })

    it('does not call the API or navigate when the form is empty', async () => {
        const loginSpy = vi.spyOn(AuthApi, 'login')
        const wrapper = mountView(LoginView)

        await wrapper.get('form').trigger('submit')

        // Wait for validation to surface errors, proving the submit was blocked.
        await vi.waitFor(() => {
            expect(wrapper.find('.v-input--error').exists()).toBe(true)
        })
        expect(loginSpy).not.toHaveBeenCalled()
        expect(push).not.toHaveBeenCalled()
    })

    it('does not submit when the email is invalid', async () => {
        const loginSpy = vi.spyOn(AuthApi, 'login')
        const wrapper = mountView(LoginView)

        await wrapper.find('input[type="email"]').setValue('not-an-email')
        await wrapper.find('input[type="password"]').setValue('super-secret')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.find('.v-input--error').exists()).toBe(true)
        })
        expect(loginSpy).not.toHaveBeenCalled()
        expect(push).not.toHaveBeenCalled()
    })

    it('logs in with valid credentials and navigates to the dashboard', async () => {
        const loginSpy = vi.spyOn(AuthApi, 'login').mockResolvedValue(authentication)
        const wrapper = mountView(LoginView)

        await wrapper.find('input[type="email"]').setValue('admin@example.com')
        await wrapper.find('input[type="password"]').setValue('super-secret')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(push).toHaveBeenCalledWith({ name: RouteNames.DASHBOARD })
        })
        expect(loginSpy).toHaveBeenCalledWith({
            body: { email: 'admin@example.com', password: 'super-secret' },
        })
    })

    it('shows a loading state on the submit button while the request is pending', async () => {
        let resolveLogin!: (value: AuthenticationDto) => void
        const pending = new Promise<AuthenticationDto>((resolve) => {
            resolveLogin = resolve
        })
        vi.spyOn(AuthApi, 'login').mockReturnValue(pending)
        const wrapper = mountView(LoginView)

        await wrapper.find('input[type="email"]').setValue('admin@example.com')
        await wrapper.find('input[type="password"]').setValue('super-secret')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.get('button[type="submit"]').classes()).toContain('v-btn--loading')
        })

        resolveLogin(authentication)
        await flushPromises()

        expect(wrapper.get('button[type="submit"]').classes()).not.toContain('v-btn--loading')
    })

    it('persists the issued token before navigating', async () => {
        vi.spyOn(AuthApi, 'login').mockResolvedValue(authentication)
        const wrapper = mountView(LoginView)

        await wrapper.find('input[type="email"]').setValue('admin@example.com')
        await wrapper.find('input[type="password"]').setValue('super-secret')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(push).toHaveBeenCalled()
        })
        expect(localStorage.getItem(JWT_KEY)).toContain('jwt-token')
    })

    it('shows an invalid credentials alert when the API answers 401', async () => {
        vi.spyOn(AuthApi, 'login').mockRejectedValue({ message: 'Unauthorized', statusCode: 401 })
        const wrapper = mountView(LoginView)

        await submitCredentials(wrapper)

        await vi.waitFor(() => {
            expect(wrapper.get('.inline-alert').text()).toContain(
                'Email or password is wrong. Check both and try again.',
            )
        })
        expect(push).not.toHaveBeenCalled()
        expect(localStorage.getItem(JWT_KEY)).toBeNull()
    })

    it('shows the API message for other failures', async () => {
        vi.spyOn(AuthApi, 'login').mockRejectedValue({ message: 'Too Many Requests', statusCode: 429 })
        const wrapper = mountView(LoginView)

        await submitCredentials(wrapper)

        await vi.waitFor(() => {
            expect(wrapper.get('.inline-alert').text()).toContain('Too Many Requests')
        })
        expect(push).not.toHaveBeenCalled()
    })

    it('falls back to a generic message when the failure has no message', async () => {
        vi.spyOn(AuthApi, 'login').mockRejectedValue(null)
        const wrapper = mountView(LoginView)

        await submitCredentials(wrapper)

        await vi.waitFor(() => {
            expect(wrapper.get('.inline-alert').text()).toContain(
                "Couldn't log in. Check your connection and try again.",
            )
        })
    })

    it('clears the alert after a successful retry', async () => {
        vi.spyOn(AuthApi, 'login')
            .mockRejectedValueOnce({ message: 'Unauthorized', statusCode: 401 })
            .mockResolvedValueOnce(authentication)
        const wrapper = mountView(LoginView)

        await submitCredentials(wrapper)
        await vi.waitFor(() => expect(wrapper.find('.inline-alert').exists()).toBe(true))
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => expect(push).toHaveBeenCalled())
        expect(wrapper.find('.inline-alert').exists()).toBe(false)
    })

    it('returns to the internal page that required the login', async () => {
        route.query = { redirect: '/users/3?tab=permissions' }
        vi.spyOn(AuthApi, 'login').mockResolvedValue(authentication)
        const wrapper = mountView(LoginView)

        await submitCredentials(wrapper)

        await vi.waitFor(() => {
            expect(push).toHaveBeenCalledWith('/users/3?tab=permissions')
        })
    })

    it.each(['https://evil.example.com', '//evil.example.com', '/\\evil.example.com'])(
        'ignores the external redirect %s',
        async (redirect) => {
            route.query = { redirect }
            vi.spyOn(AuthApi, 'login').mockResolvedValue(authentication)
            const wrapper = mountView(LoginView)

            await submitCredentials(wrapper)

            await vi.waitFor(() => {
                expect(push).toHaveBeenCalledWith({ name: RouteNames.DASHBOARD })
            })
        },
    )
})

describe('LoginView after a 401', () => {
    it('explains that the session expired', () => {
        route.query = { expired: '1', redirect: '/projects' }
        const wrapper = mountView(LoginView)

        expect(wrapper.get('.inline-alert').text()).toContain(
            'Your session expired. Log in again to continue where you left off.',
        )
    })
})
