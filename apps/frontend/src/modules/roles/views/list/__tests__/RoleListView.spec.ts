import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, RoleApi } from 'api'
import RoleListView from '../RoleListView.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { allRoles, heldAll } from '@/modules/roles/__tests__/roleFixtures.ts'
import { signedIn } from '@/modules/users/views/__tests__/userFixtures.ts'

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function mockApis() {
    vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(allRoles())
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(signedIn())
    vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(heldAll())
}

describe('RoleListView', () => {
    it('lists global and project roles in two cards with counts', async () => {
        mockApis()
        const wrapper = mountInApp(RoleListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Maintainer'))
        const titles = wrapper.findAll('h2').map((heading) => heading.text().replace(/\s*\d+$/, ''))
        expect(titles).toEqual(['Global roles', 'Project roles'])
        expect(wrapper.text()).toContain('System')
        expect(wrapper.text()).toContain('All permissions')
        expect(wrapper.text()).toContain('2 permissions')
        expect(wrapper.text()).toContain('2 users')
        expect(wrapper.text()).toContain('3 members')
        expect(wrapper.findAll('.list-row--link')).toHaveLength(7)
    })

    it('shows New role only with the create permission', async () => {
        mockApis()
        const wrapper = mountInApp(RoleListView, {}, [{ action: 'read', subject: 'Role' }])

        await vi.waitFor(() => expect(wrapper.text()).toContain('Maintainer'))
        expect(findButton(wrapper, 'New role')).toBeUndefined()
    })

    it('offers a retry when loading fails', async () => {
        vi.spyOn(RoleApi, 'getRoles').mockRejectedValue({ statusCode: 503, message: 'Unavailable' })
        const wrapper = mountInApp(RoleListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't load roles"))
        expect(findButton(wrapper, 'Try again')).toBeDefined()
    })
})
