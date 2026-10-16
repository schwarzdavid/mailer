import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, RoleApi } from 'api'
import RoleDetailView from '../RoleDetailView.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { globalRoles, heldAll, projectRoleSummaries } from '@/modules/roles/__tests__/roleFixtures.ts'
import { signedIn } from '@/modules/users/views/__tests__/userFixtures.ts'

const { params } = vi.hoisted(() => ({ params: { roleId: '2' } }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return {
        ...actual,
        useRoute: () => ({ params, meta: {} }),
        useRouter: () => ({ push: vi.fn<ReturnType<typeof actual.useRouter>['push']>().mockResolvedValue(undefined) }),
        onBeforeRouteLeave: vi.fn<typeof actual.onBeforeRouteLeave>(),
    }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    params.roleId = '2'
    document.body.innerHTML = ''
})

function mockApis(role = globalRoles[1]!) {
    params.roleId = String(role.roleId)
    vi.spyOn(RoleApi, 'getRole').mockResolvedValue(role)
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(signedIn())
    vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
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
