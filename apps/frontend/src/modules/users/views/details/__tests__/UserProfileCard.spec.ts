import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, RoleApi, UserApi } from 'api'
import UserProfileCard from '../partials/UserProfileCard.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { roles, signedIn, userDetail } from '../../__tests__/userFixtures.ts'
import { heldAll } from '@/modules/roles/__tests__/roleFixtures.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, onBeforeRouteLeave: vi.fn<typeof actual.onBeforeRouteLeave>() }
})

vi.stubGlobal('visualViewport', null)

const notifications = useNotificationHost()

afterEach(() => {
    vi.restoreAllMocks()
    notifications.dismiss()
    document.body.innerHTML = ''
})

function mountCard(props: { canUpdate?: boolean; isSelf?: boolean } = {}) {
    vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(signedIn())
    vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
    return mountInApp(UserProfileCard, { user: userDetail(), canUpdate: true, isSelf: false, ...props })
}

function inputValue(wrapper: ReturnType<typeof mountInApp>, name: string) {
    return (wrapper.get(`input[name="${name}"]`).element as HTMLInputElement).value
}

describe('UserProfileCard', () => {
    it('prefills the profile', () => {
        const wrapper = mountCard()

        expect(inputValue(wrapper, 'firstName')).toBe('Max')
        expect(inputValue(wrapper, 'email')).toBe('max@acme.com')
        expect(inputValue(wrapper, 'password')).toBe('')
    })

    it('saves the profile without touching the password when left empty', async () => {
        const update = vi.spyOn(UserApi, 'updateUser').mockResolvedValue(userDetail())
        const wrapper = mountCard()

        await wrapper.get('input[name="firstName"]').setValue('Maximilian')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() =>
            expect(update).toHaveBeenCalledWith({
                path: { userId: 4 },
                body: { firstName: 'Maximilian', lastName: 'Mustermann', email: 'max@acme.com', roleId: 3 },
            }),
        )
        await vi.waitFor(() => expect(notifications.current.value?.text).toBe('Profile saved'))
    })

    it('sends a new password when one is entered', async () => {
        const update = vi.spyOn(UserApi, 'updateUser').mockResolvedValue(userDetail())
        const wrapper = mountCard()

        await wrapper.get('input[name="password"]').setValue('a-new-password')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() =>
            expect(update).toHaveBeenCalledWith({
                path: { userId: 4 },
                body: expect.objectContaining({ password: 'a-new-password' }),
            }),
        )
    })

    it('never sends the role for your own profile', async () => {
        const update = vi.spyOn(UserApi, 'updateUser').mockResolvedValue(userDetail())
        const wrapper = mountCard({ isSelf: true })

        expect(wrapper.text()).toContain("You can't change your own role.")
        await wrapper.get('input[name="firstName"]').setValue('Maximilian')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => expect(update).toHaveBeenCalled())
        expect(update.mock.calls[0]![0].body).not.toHaveProperty('roleId')
    })

    it('shows values as text without the update permission', () => {
        const wrapper = mountCard({ canUpdate: false })

        expect(wrapper.find('input').exists()).toBe(false)
        expect(wrapper.text()).toContain('max@acme.com')
        expect(findButton(wrapper, 'Save')).toBeUndefined()
    })

    it('keeps the input and shows a failed save inside the card', async () => {
        vi.spyOn(UserApi, 'updateUser').mockRejectedValue({ message: 'Email already in use' })
        const wrapper = mountCard()

        await wrapper.get('input[name="email"]').setValue('tom@acme.com')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => expect(wrapper.text()).toContain('Email already in use'))
        expect(inputValue(wrapper, 'email')).toBe('tom@acme.com')
    })
})
