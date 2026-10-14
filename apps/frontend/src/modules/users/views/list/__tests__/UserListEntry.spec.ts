import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { RawRuleOf } from '@casl/ability'
import { AuthApi, type UserDto } from 'api'
import UserListEntry from '../partials/UserListEntry.vue'
import { mountView } from '@/__tests__/support.ts'
import type { AppAbility } from '@/plugins/casl.ts'
import { RouteNames } from '@/router/RouteNames.ts'

function createTestRouter(): Router {
    return createRouter({
        history: createMemoryHistory(),
        routes: Object.values(RouteNames).map((name, index) => ({
            path: name === RouteNames.USER_DETAILS ? '/users/:userId' : `/${index}`,
            name,
            component: { template: '<div />' },
        })),
    })
}

const caller: UserDto = {
    userId: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    role: { roleId: 2, name: 'Admin', type: 'admin' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

const grace: UserDto = {
    userId: 7,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    role: { roleId: 3, name: 'User', type: 'user' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

function mountEntry(user: UserDto, rules?: RawRuleOf<AppAbility>[]) {
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(caller)
    return mountView(UserListEntry, { props: { user }, global: { plugins: [createTestRouter()] } }, rules)
}

function hasDeleteButton(wrapper: ReturnType<typeof mountView>) {
    return wrapper.find('.mdi-delete').exists()
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('UserListEntry', () => {
    it('shows name, email and role and links to the detail page', async () => {
        const wrapper = mountEntry(grace)

        expect(wrapper.text()).toContain('Grace Hopper')
        expect(wrapper.text()).toContain('grace@example.com')
        expect(wrapper.text()).toContain('User')
        await vi.waitFor(() => expect(wrapper.get('a').attributes('href')).toBe('/users/7'))
    })

    it('offers deletion of other users with the delete permission', async () => {
        const wrapper = mountEntry(grace)

        await vi.waitFor(() => expect(hasDeleteButton(wrapper)).toBe(true))
    })

    it('never offers deleting oneself', async () => {
        const wrapper = mountEntry(caller)

        await flushPromises()
        await vi.waitFor(() => expect(hasDeleteButton(wrapper)).toBe(false))
    })

    it('hides deletion without the delete permission', async () => {
        const wrapper = mountEntry(grace, [{ action: 'read', subject: 'User' }])

        await flushPromises()
        expect(hasDeleteButton(wrapper)).toBe(false)
    })

    it('respects conditional delete rules', async () => {
        const rules: RawRuleOf<AppAbility>[] = [
            { action: 'delete', subject: 'User', conditions: { 'role.type': { $ne: 'super_admin' } } },
        ]
        const superAdmin: UserDto = { ...grace, role: { roleId: 1, name: 'Super Admin', type: 'super_admin' } }

        const allowed = mountEntry(grace, rules)
        const denied = mountEntry(superAdmin, rules)

        await vi.waitFor(() => expect(hasDeleteButton(allowed)).toBe(true))
        expect(hasDeleteButton(denied)).toBe(false)
    })
})
