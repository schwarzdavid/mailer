import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, UserApi, RoleApi, type RoleDto, type UserDetailDto, type UserDto } from 'api'
import type { Router } from 'vue-router'
import UserDetailView from '../UserDetailView.vue'
import { mountView } from '@/__tests__/support.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRoute: () => ({ params: { userId: '7' } }), useRouter: () => ({ push }) }
})

const detail: UserDetailDto = {
    userId: 7,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    role: { roleId: 3, name: 'User', type: 'user' },
    permissions: ['domains.read'],
    memberships: [{ projectId: 1, projectName: 'Acme', permissions: ['read'] }],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

const roles: RoleDto[] = [
    { roleId: 1, name: 'Super Admin', type: 'super_admin', permissions: [] },
    { roleId: 2, name: 'Admin', type: 'admin', permissions: [] },
    { roleId: 3, name: 'User', type: 'user', permissions: [] },
]

const superAdminCaller: UserDto = {
    userId: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    role: { roleId: 1, name: 'Super Admin', type: 'super_admin' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
})

describe('UserDetailView', () => {
    it('renders profile, permissions, and memberships', async () => {
        vi.spyOn(UserApi, 'getUser').mockResolvedValue(detail)
        vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(superAdminCaller)
        const wrapper = mountView(UserDetailView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })
        expect(wrapper.text()).toContain('Profile')
        expect(wrapper.text()).toContain('Direct permissions')
        expect(wrapper.text()).toContain('Acme')

        await vi.waitFor(() => {
            const roleSelect = wrapper.findComponent({ name: 'VSelect' })
            expect(roleSelect.props('items')).toContainEqual(expect.objectContaining({ name: 'Super Admin' }))
        })
    })

    it('saves toggled permissions', async () => {
        vi.spyOn(UserApi, 'getUser').mockResolvedValue(detail)
        vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(superAdminCaller)
        const replaceSpy = vi.spyOn(UserApi, 'replaceUserPermissions').mockResolvedValue({ permissions: [] })
        const wrapper = mountView(UserDetailView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Direct permissions')
        })

        const checkbox = wrapper.find('input[value="domains.create"]')
        await checkbox.setValue(true)
        const saveButton = wrapper
            .findAll('button')
            .find((button) => button.text() === 'Save' && button.element.closest('.permissions-card'))
        await saveButton!.trigger('click')

        await vi.waitFor(() => {
            expect(replaceSpy).toHaveBeenCalledWith({
                path: { userId: 7 },
                body: { permissions: ['domains.read', 'domains.create'] },
            })
        })
    })
})
