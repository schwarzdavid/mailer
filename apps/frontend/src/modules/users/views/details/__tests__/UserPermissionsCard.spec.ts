import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { RawRuleOf } from '@casl/ability'
import { UserApi, type Permission, type UserDetailDto } from 'api'
import UserPermissionsCard from '../partials/UserPermissionsCard.vue'
import { mountView } from '@/__tests__/support.ts'
import type { AppAbility } from '@/plugins/casl.ts'
import { PERMISSION_GROUPS } from '@/modules/users/permissionGroups.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const grace: UserDetailDto = {
    userId: 7,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    role: { roleId: 3, name: 'User', type: 'user' },
    permissions: ['domains.read', 'bounces.read'],
    memberships: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

function mountCard(rules?: RawRuleOf<AppAbility>[]) {
    return mountView(UserPermissionsCard, { props: { user: grace } }, rules)
}

function checkbox(wrapper: ReturnType<typeof mountView>, permission: Permission) {
    return wrapper.get<HTMLInputElement>(`input[value="${permission}"]`)
}

function checked(wrapper: ReturnType<typeof mountView>) {
    return wrapper
        .findAll<HTMLInputElement>('input[type="checkbox"]')
        .filter((input) => input.element.checked)
        .map((input) => input.element.value)
}

async function save(wrapper: ReturnType<typeof mountView>) {
    const button = wrapper.findAll('button').find((candidate) => candidate.text() === 'Save')
    await button!.trigger('click')
    await flushPromises()
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('UserPermissionsCard', () => {
    it('renders a labelled checkbox for every permission', () => {
        const wrapper = mountCard()

        expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(Object.values(PERMISSION_GROUPS).flat().length)
        expect(wrapper.text()).toContain('View domains')
        expect(wrapper.text()).toContain('Unblock addresses')
        expect(wrapper.text()).not.toContain('permissions.labels')
    })

    it('checks the directly granted permissions', () => {
        const wrapper = mountCard()

        expect(checked(wrapper)).toEqual(['domains.read', 'bounces.read'])
    })

    it('saves the permissions after granting and revoking', async () => {
        const replace = vi.spyOn(UserApi, 'replaceUserPermissions').mockResolvedValue({ permissions: [] })
        const wrapper = mountCard()

        await checkbox(wrapper, 'users.read').setValue(true)
        await checkbox(wrapper, 'domains.read').setValue(false)
        await save(wrapper)

        await vi.waitFor(() =>
            expect(replace).toHaveBeenCalledWith({
                path: { userId: 7 },
                body: { permissions: ['bounces.read', 'users.read'] },
            }),
        )
    })

    it('is read-only without the update permission', () => {
        const wrapper = mountCard([{ action: 'read', subject: 'User' }])

        expect(
            wrapper.findAll('input[type="checkbox"]').every((input) => input.attributes('disabled') !== undefined),
        ).toBe(true)
        expect(wrapper.findAll('button').some((button) => button.text() === 'Save')).toBe(false)
    })

    it('shows the API error message', async () => {
        vi.spyOn(UserApi, 'replaceUserPermissions').mockRejectedValue({ message: 'Cannot grant roles.read' })
        const wrapper = mountCard()

        await save(wrapper)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Cannot grant roles.read'))
    })

    it('falls back to a generic error without a message', async () => {
        vi.spyOn(UserApi, 'replaceUserPermissions').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = mountCard()

        await save(wrapper)

        await vi.waitFor(() => expect(wrapper.text()).toContain('The permissions could not be saved'))
    })
})
