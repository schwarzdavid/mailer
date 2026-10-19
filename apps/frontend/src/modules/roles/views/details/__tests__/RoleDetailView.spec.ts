import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, RoleApi } from 'api'
import type { Router } from 'vue-router'
import { QueryClient } from '@tanstack/vue-query'
import RoleDetailView from '../RoleDetailView.vue'
import { findButton, mountInApp, overlayText } from '@/__tests__/support.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'
import { RouteNames } from '@/router/RouteNames.ts'
import { globalRoles, heldAll, projectRoleSummaries } from '@/modules/roles/__tests__/roleFixtures.ts'
import { signedIn } from '@/modules/users/views/__tests__/userFixtures.ts'

const { params, push } = vi.hoisted(() => ({
    params: { roleId: '2' },
    push: vi.fn<Router['push']>(),
}))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return {
        ...actual,
        useRoute: () => ({ params, meta: {} }),
        useRouter: () => ({ push }),
        onBeforeRouteLeave: vi.fn<typeof actual.onBeforeRouteLeave>(),
    }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    push.mockReset()
    params.roleId = '2'
    document.body.innerHTML = ''
})

function mockApis(role = globalRoles[1]!) {
    params.roleId = String(role.roleId)
    vi.spyOn(RoleApi, 'getRole').mockResolvedValue(role)
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(signedIn())
    vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
}

function confirmDialogButton(label: string): HTMLButtonElement {
    return [...document.body.querySelectorAll<HTMLButtonElement>('.confirm-dialog button')].find(
        (button) => button.textContent?.trim() === label,
    )!
}

describe('RoleDetailView', () => {
    it('shows profile, permissions and the danger zone of a custom role', async () => {
        mockApis({ ...globalRoles[1]!, assignmentCount: 0 })
        const wrapper = mountInApp(RoleDetailView)

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toContain('Admin'))
        const titles = wrapper.findAll('h2').map((heading) => heading.text())
        expect(titles).toEqual(['Profile', 'Permissions', 'Delete role'])
        expect(wrapper.get('.page-header').text()).toContain('Global')
        expect(wrapper.text()).toContain('Assigned to no users')
        expect(findButton(wrapper, 'Delete role…')).toBeDefined()
    })

    it('deletes an unassigned role after confirmation and returns to the list', async () => {
        mockApis({ ...globalRoles[1]!, assignmentCount: 0 })
        push.mockResolvedValue(undefined)
        const remove = vi.spyOn(RoleApi, 'deleteRole').mockResolvedValue(undefined)
        const removeQueries = vi.spyOn(QueryClient.prototype, 'removeQueries')
        const wrapper = mountInApp(RoleDetailView)
        await vi.waitFor(() => expect(findButton(wrapper, 'Delete role…')).toBeDefined())

        await findButton(wrapper, 'Delete role…')!.trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Delete role Admin?'))
        confirmDialogButton('Delete role').click()

        await vi.waitFor(() => expect(remove).toHaveBeenCalledWith({ path: { roleId: 2 } }))
        await vi.waitFor(() => expect(push).toHaveBeenCalledWith({ name: RouteNames.ROLE_LIST }))
        await vi.waitFor(() => expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['roles', 2], exact: true }))
        expect(push.mock.invocationCallOrder[0]!).toBeLessThan(removeQueries.mock.invocationCallOrder[0]!)
        await vi.waitFor(() => expect(useNotificationHost().current.value?.text).toBe('Admin deleted'))
    })

    it('keeps the role when the deletion is cancelled', async () => {
        mockApis({ ...globalRoles[1]!, assignmentCount: 0 })
        const remove = vi.spyOn(RoleApi, 'deleteRole').mockResolvedValue(undefined)
        const wrapper = mountInApp(RoleDetailView)
        await vi.waitFor(() => expect(findButton(wrapper, 'Delete role…')).toBeDefined())

        await findButton(wrapper, 'Delete role…')!.trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Delete role Admin?'))
        confirmDialogButton('Cancel').click()

        await vi.waitFor(() => expect(overlayText()).not.toContain('Delete role Admin?'))
        expect(remove).not.toHaveBeenCalled()
        expect(push).not.toHaveBeenCalled()
    })

    it('blocks deletion while the role is assigned', async () => {
        mockApis(globalRoles[1])
        const wrapper = mountInApp(RoleDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Assigned to 1 user'))
        expect(wrapper.text()).toContain('Admin is still assigned')
        expect(findButton(wrapper, 'Delete role…')).toBeUndefined()
    })

    it('shows the super admin role read-only', async () => {
        mockApis(globalRoles[0])
        const wrapper = mountInApp(RoleDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('System role with every permission'))
        expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual(['Profile'])
        expect(wrapper.find('input[name="name"]').exists()).toBe(false)
    })

    it('hides editing without roles.update', async () => {
        mockApis(projectRoleSummaries()[0])
        const wrapper = mountInApp(RoleDetailView, {}, [{ action: 'read', subject: 'Role' }])

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toContain('Viewer'))
        expect(wrapper.find('input[name="name"]').exists()).toBe(false)
        expect(findButton(wrapper, 'Save')).toBeUndefined()
        expect(wrapper.text()).not.toContain('Delete role')
    })

    it('shows the not-found state', async () => {
        vi.spyOn(RoleApi, 'getRole').mockRejectedValue({ statusCode: 404 })
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(signedIn())
        const wrapper = mountInApp(RoleDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("This role doesn't exist"))
        expect(findButton(wrapper, 'Back to roles')).toBeDefined()
    })
})
