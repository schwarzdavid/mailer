import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, RoleApi } from 'api'
import RolePermissionsCard from '../partials/RolePermissionsCard.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { globalRoles, heldAll, heldOnly, projectRoleSummaries } from '@/modules/roles/__tests__/roleFixtures.ts'
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
    return wrapper.get(`input[value="${permission}"]`).element as HTMLInputElement
}

describe('RolePermissionsCard', () => {
    it('saves the changed permission set of a global role', async () => {
        vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
        const update = vi.spyOn(RoleApi, 'updateRole').mockResolvedValue(globalRoles[1])
        const wrapper = mountInApp(RolePermissionsCard, { role: globalRoles[1], canUpdate: true })

        expect(checkbox(wrapper, 'domains.read').checked).toBe(true)
        await vi.waitFor(() => expect(checkbox(wrapper, 'users.read').disabled).toBe(false))
        await wrapper.get('input[value="users.read"]').setValue(true)
        expect(wrapper.text()).toContain('Unsaved changes')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() =>
            expect(update).toHaveBeenCalledWith({
                path: { roleId: 2 },
                body: { permissions: ['domains.read', 'projects.all', 'users.read'] },
            }),
        )
        await vi.waitFor(() => expect(notifications.current.value?.text).toBe('Permissions saved'))
    })

    it('keeps read required on project roles and uses project-wide held permissions', async () => {
        vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldOnly([], ['read', 'forms.manage']))
        const wrapper = mountInApp(RolePermissionsCard, { role: projectRoleSummaries()[0], canUpdate: true })

        await vi.waitFor(() => expect(checkbox(wrapper, 'forms.manage').disabled).toBe(false))
        expect(wrapper.text()).toContain("You don't hold this permission")
        expect(checkbox(wrapper, 'read').checked).toBe(true)
        expect(checkbox(wrapper, 'read').disabled).toBe(true)
        expect(checkbox(wrapper, 'forms.manage').disabled).toBe(false)
        expect(checkbox(wrapper, 'delete').disabled).toBe(true)
    })

    it('keeps read when saving a project role', async () => {
        vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
        const update = vi.spyOn(RoleApi, 'updateRole').mockResolvedValue(projectRoleSummaries()[0])
        const wrapper = mountInApp(RolePermissionsCard, { role: projectRoleSummaries()[0], canUpdate: true })

        await vi.waitFor(() => expect(checkbox(wrapper, 'delete').disabled).toBe(false))
        await wrapper.get('input[value="delete"]').setValue(true)
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() =>
            expect(update).toHaveBeenCalledWith({ path: { roleId: 5 }, body: { permissions: ['read', 'delete'] } }),
        )
    })

    it('is read-only without the update permission', () => {
        vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
        const wrapper = mountInApp(RolePermissionsCard, { role: globalRoles[1], canUpdate: false })

        expect(checkbox(wrapper, 'users.read').disabled).toBe(true)
        expect(findButton(wrapper, 'Save')).toBeUndefined()
        expect(wrapper.text()).not.toContain("You don't hold this permission")
    })
})
