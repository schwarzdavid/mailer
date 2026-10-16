import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, RoleApi, UserApi } from 'api'
import UserPermissionsCard from '../partials/UserPermissionsCard.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { roles, userDetail } from '../../__tests__/userFixtures.ts'
import { heldAll, heldOnly } from '@/modules/roles/__tests__/roleFixtures.ts'
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

function checkbox(wrapper: ReturnType<typeof mountInApp>, permission: string) {
    return wrapper.get(`input[value="${permission}"]`)
}

describe('UserPermissionsCard', () => {
    it('checks direct permissions and explains how access adds up', () => {
        vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
        vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
        const wrapper = mountInApp(UserPermissionsCard, { user: userDetail(), canUpdate: true })

        expect((checkbox(wrapper, 'bounces.read').element as HTMLInputElement).checked).toBe(true)
        expect((checkbox(wrapper, 'domains.read').element as HTMLInputElement).checked).toBe(false)
        expect(wrapper.text()).toContain('How access works')
    })

    it('shows permissions of the role as checked and locked', async () => {
        vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
        vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
        const admin = userDetail({ role: { roleId: 2, type: 'admin', name: 'Admin' }, permissions: [] })
        const wrapper = mountInApp(UserPermissionsCard, { user: admin, canUpdate: true })

        await vi.waitFor(() => expect(wrapper.text()).toContain('From role: Admin'))
        const domains = checkbox(wrapper, 'domains.read').element as HTMLInputElement
        expect(domains.checked).toBe(true)
        expect(domains.disabled).toBe(true)
    })

    it('saves granted permissions with the card footer', async () => {
        vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
        vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
        const save = vi.spyOn(UserApi, 'replaceUserPermissions').mockResolvedValue({ permissions: [] })
        const wrapper = mountInApp(UserPermissionsCard, { user: userDetail(), canUpdate: true })

        await vi.waitFor(() =>
            expect((checkbox(wrapper, 'domains.read').element as HTMLInputElement).disabled).toBe(false),
        )
        await checkbox(wrapper, 'domains.read').setValue(true)
        expect(wrapper.text()).toContain('Unsaved changes')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() =>
            expect(save).toHaveBeenCalledWith({
                path: { userId: 4 },
                body: { permissions: ['bounces.read', 'domains.read'] },
            }),
        )
        await vi.waitFor(() => expect(notifications.current.value?.text).toBe('Permissions saved'))
    })

    it('locks permissions the current user does not hold', async () => {
        vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
        vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldOnly(['bounces.read']))
        const wrapper = mountInApp(UserPermissionsCard, { user: userDetail(), canUpdate: true })

        await vi.waitFor(() =>
            expect((checkbox(wrapper, 'bounces.read').element as HTMLInputElement).disabled).toBe(false),
        )
        expect(wrapper.text()).toContain("You don't hold this permission")
        expect((checkbox(wrapper, 'domains.read').element as HTMLInputElement).disabled).toBe(true)
        expect((checkbox(wrapper, 'bounces.read').element as HTMLInputElement).disabled).toBe(false)
    })

    it('is read-only without the update permission', () => {
        vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
        vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
        const wrapper = mountInApp(UserPermissionsCard, { user: userDetail(), canUpdate: false })

        expect((checkbox(wrapper, 'domains.read').element as HTMLInputElement).disabled).toBe(true)
        expect(wrapper.text()).not.toContain("You don't hold this permission")
        expect(findButton(wrapper, 'Save')).toBeUndefined()
    })

    it('shows a failed save inside the card', async () => {
        vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
        vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
        vi.spyOn(UserApi, 'replaceUserPermissions').mockRejectedValue({ message: 'Forbidden' })
        const wrapper = mountInApp(UserPermissionsCard, { user: userDetail(), canUpdate: true })

        await vi.waitFor(() =>
            expect((checkbox(wrapper, 'domains.read').element as HTMLInputElement).disabled).toBe(false),
        )
        await checkbox(wrapper, 'domains.read').setValue(true)
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't save the permissions"))
        expect(wrapper.text()).toContain('Forbidden')
    })
})
