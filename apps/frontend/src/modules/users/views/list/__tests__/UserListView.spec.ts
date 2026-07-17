import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserApi, type UserDto } from 'api'
import UserListView from '../UserListView.vue'
import { mountView } from '@/__tests__/support.ts'

const users: UserDto[] = [
    {
        userId: 7,
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        role: { roleId: 3, name: 'User', type: 'user' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('UserListView', () => {
    it('renders one entry per user with the role chip', async () => {
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue(users)
        const wrapper = mountView(UserListView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })
        expect(wrapper.text()).toContain('grace@example.com')
        expect(wrapper.get('h1').text()).toBe('Users')
        const chips = wrapper.findAllComponents({ name: 'VChip' })
        expect(chips.some((chip) => chip.text() === 'User')).toBe(true)
    })

    it('hides the add button without the create permission', async () => {
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue(users)
        const wrapper = mountView(UserListView, {}, [{ action: 'read', subject: 'User' }])

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })
        expect(wrapper.text()).not.toContain('Add')
    })
})
