import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, RoleApi, UserApi } from 'api'
import UserDetailView from '../UserDetailView.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { roles, signedIn, userDetail } from '../../__tests__/userFixtures.ts'

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return {
        ...actual,
        useRoute: () => ({ params: { userId: '4' }, meta: {} }),
        onBeforeRouteLeave: vi.fn<typeof actual.onBeforeRouteLeave>(),
    }
})

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function mockApis(user = userDetail(), as = signedIn()) {
    vi.spyOn(UserApi, 'getUser').mockResolvedValue(user)
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(as)
    vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
}

describe('UserDetailView', () => {
    it('shows the user with role, email, memberships and every card', async () => {
        mockApis()
        const wrapper = mountInApp(UserDetailView)

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toContain('Max Mustermann'))
        expect(wrapper.get('.page-header').text()).toContain('User')
        expect(wrapper.get('.page-header').text()).toContain('Member of 1 project')
        const titles = wrapper.findAll('h2').map((heading) => heading.text().replace(/\s*\d+$/, ''))
        expect(titles).toEqual(['Profile', 'Permissions', 'Project memberships', 'Delete user'])
    })

    it('explains Super admins instead of a permissions grid', async () => {
        mockApis(userDetail({ role: { roleId: 1, type: 'super_admin', name: 'Super Admin' } }))
        const wrapper = mountInApp(UserDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Super admins have every permission'))
        expect(wrapper.text()).not.toContain('Project memberships')
    })

    it('locks the role and hides deletion on your own page', async () => {
        mockApis(userDetail({ userId: 4 }), signedIn('admin', 4))
        const wrapper = mountInApp(UserDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("You can't change your own role."))
        expect(wrapper.findAll('h2').map((heading) => heading.text())).not.toContain('Delete user')
    })

    it('shows the not-found state', async () => {
        vi.spyOn(UserApi, 'getUser').mockRejectedValue({ statusCode: 404 })
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(signedIn())
        const wrapper = mountInApp(UserDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("This user doesn't exist"))
        expect(findButton(wrapper, 'Back to users')).toBeDefined()
    })
})
