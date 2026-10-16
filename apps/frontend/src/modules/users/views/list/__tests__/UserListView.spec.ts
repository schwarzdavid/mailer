import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, RoleApi, UserApi } from 'api'
import UserListView from '../UserListView.vue'
import { findButton, mountInApp, overlayText } from '@/__tests__/support.ts'
import { userListItem } from '@/__tests__/fixtures.ts'
import { roles, signedIn } from '../../__tests__/userFixtures.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

const users = [
    userListItem({ userId: 3, firstName: 'Tom', lastName: 'Becker', membershipCount: 0 }),
    userListItem({
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@acme.com',
        role: { roleId: 1, type: 'super_admin', name: 'Super Admin' },
    }),
    userListItem({
        userId: 2,
        firstName: 'Lisa',
        lastName: 'Schneider',
        role: { roleId: 2, type: 'admin', name: 'Admin' },
        membershipCount: 1,
    }),
]

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function mockApis() {
    vi.spyOn(UserApi, 'getUsers').mockResolvedValue(users)
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(signedIn())
    vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
}

describe('UserListView', () => {
    it('lists users by role, then name, with role tags and project counts', async () => {
        mockApis()
        const wrapper = mountInApp(UserListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Tom Becker'))
        const rows = wrapper.findAll('tbody tr').map((row) => row.text())
        expect(rows[0]).toContain('Ada Lovelace')
        expect(rows[0]).toContain('You')
        expect(rows[0]).toContain('Super Admin')
        expect(rows[0]).toContain('All')
        expect(rows[1]).toContain('Lisa Schneider')
        expect(rows[1]).toContain('Admin')
        expect(rows[2]).toContain('Tom Becker')
    })

    it('offers no menu on your own row', async () => {
        mockApis()
        const wrapper = mountInApp(UserListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Tom Becker'))
        expect(wrapper.find('button[aria-label="Actions for Ada Lovelace"]').exists()).toBe(false)
        expect(wrapper.find('button[aria-label="Actions for Tom Becker"]').exists()).toBe(true)
    })

    it('deletes a user from the row menu after confirmation', async () => {
        mockApis()
        const remove = vi.spyOn(UserApi, 'deleteUser').mockResolvedValue(undefined)
        const wrapper = mountInApp(UserListView)
        await vi.waitFor(() => expect(wrapper.text()).toContain('Tom Becker'))

        await wrapper.get('button[aria-label="Actions for Tom Becker"]').trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Delete user…'))
        const deleteItem = [...document.body.querySelectorAll<HTMLElement>('.v-list-item')].find((item) =>
            item.textContent?.includes('Delete user…'),
        )!
        deleteItem.click()
        await vi.waitFor(() => expect(overlayText()).toContain('Delete user Tom Becker?'))
        const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('.confirm-dialog button')].find(
            (button) => button.textContent?.trim() === 'Delete user',
        )!
        confirm.click()

        await vi.waitFor(() => expect(remove).toHaveBeenCalledWith({ path: { userId: 3 } }))
    })

    it('shows New user only with the create permission', async () => {
        mockApis()
        const wrapper = mountInApp(UserListView, {}, [{ action: 'read', subject: 'User' }])

        await vi.waitFor(() => expect(wrapper.text()).toContain('Tom Becker'))
        expect(findButton(wrapper, 'New user')).toBeUndefined()
    })
})
