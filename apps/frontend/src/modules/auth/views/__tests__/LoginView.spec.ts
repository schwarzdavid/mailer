import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { AuthApi, type AuthenticationDto } from 'api'
import type { Router } from 'vue-router'
import LoginView from '../LoginView.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
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
})

describe('LoginView', () => {
    it('renders the localized heading, fields and submit button', () => {
        const wrapper = mountView(LoginView)

        expect(wrapper.get('h1').text()).toBe('Welcome Back')
        expect(wrapper.text()).toContain('Enter your credentials to access the admin panel')
        expect(wrapper.find('input[type="email"]').exists()).toBe(true)
        expect(wrapper.find('input[type="password"]').exists()).toBe(true)
        expect(wrapper.get('button[type="submit"]').text()).toContain('Login')
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
})
