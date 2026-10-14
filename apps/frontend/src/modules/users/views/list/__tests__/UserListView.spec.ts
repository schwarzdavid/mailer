import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { VApp } from 'vuetify/components'
import { AuthApi, UserApi, type UserDto } from 'api'
import UserListView from '../UserListView.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

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

const caller: UserDto = {
    userId: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    role: { roleId: 1, name: 'Super Admin', type: 'super_admin' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

async function createTestRouter(): Promise<Router> {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: Object.values(RouteNames).map((name, index) => ({
            path: name === RouteNames.USER_LIST ? '/users' : `/${index}/:userId?`,
            name,
            component: { template: '<div />' },
        })),
    })
    await router.push('/users')
    return router
}

const ListHost = defineComponent({
    setup: () => () => h(VApp, () => h(UserListView)),
})

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
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

    it('shows skeletons while the users load', () => {
        vi.spyOn(UserApi, 'getUsers').mockReturnValue(new Promise(() => {}))
        const wrapper = mountView(UserListView)

        expect(wrapper.findAll('.v-skeleton-loader')).toHaveLength(3)
    })

    it('shows the add button with the create permission', async () => {
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue(users)
        const wrapper = mountView(UserListView, {}, [
            { action: 'read', subject: 'User' },
            { action: 'create', subject: 'User' },
        ])

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })
        expect(wrapper.findAll('button').some((button) => button.text() === 'Add')).toBe(true)
    })

    it('hides the add button without the create permission', async () => {
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue(users)
        const wrapper = mountView(UserListView, {}, [{ action: 'read', subject: 'User' }])

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })
        expect(wrapper.text()).not.toContain('Add')
    })

    it('deletes a user from the list without opening it and reloads the list', async () => {
        const getUsers = vi.spyOn(UserApi, 'getUsers').mockResolvedValueOnce(users).mockResolvedValueOnce([])
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(caller)
        const remove = vi.spyOn(UserApi, 'deleteUser').mockResolvedValue(undefined)
        const router = await createTestRouter()
        const wrapper = mountView(ListHost, { global: { plugins: [router] } })

        await vi.waitFor(() => expect(wrapper.find('.mdi-delete').exists()).toBe(true))
        wrapper.get('.mdi-delete').element.closest('button')!.click()
        await vi.waitFor(() =>
            expect(document.body.textContent).toContain('Do you really want to delete Grace Hopper?'),
        )
        expect(router.currentRoute.value.name).toBe(RouteNames.USER_LIST)

        const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('.v-overlay-container button')].find(
            (button) => button.textContent?.trim() === 'Delete',
        )
        confirm!.click()
        await flushPromises()

        await vi.waitFor(() => expect(wrapper.text()).not.toContain('Grace Hopper'))
        expect(remove).toHaveBeenCalledWith({ path: { userId: 7 } })
        expect(getUsers).toHaveBeenCalledTimes(2)
        wrapper.unmount()
    })
})
