import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { VSelect } from 'vuetify/components'
import type { RawRuleOf } from '@casl/ability'
import { AuthApi, RoleApi, UserApi, type RoleDto, type UserDetailDto, type UserDto } from 'api'
import UserProfileCard from '../partials/UserProfileCard.vue'
import { mountView } from '@/__tests__/support.ts'
import type { AppAbility } from '@/plugins/casl.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const roles: RoleDto[] = [
    { roleId: 1, name: 'Super Admin', type: 'super_admin', permissions: [] },
    { roleId: 2, name: 'Admin', type: 'admin', permissions: [] },
    { roleId: 3, name: 'User', type: 'user', permissions: [] },
]

const grace: UserDetailDto = {
    userId: 7,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    role: { roleId: 3, name: 'User', type: 'user' },
    permissions: [],
    memberships: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

function buildCaller(type: UserDto['role']['type']): UserDto {
    return {
        userId: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        role: { roleId: type === 'super_admin' ? 1 : 2, name: 'Caller', type },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }
}

async function mountCard(
    options: { user?: UserDetailDto; caller?: UserDto['role']['type']; rules?: RawRuleOf<AppAbility>[] } = {},
) {
    vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(buildCaller(options.caller ?? 'admin'))
    const wrapper = mountView(UserProfileCard, { props: { user: options.user ?? grace } }, options.rules)
    await flushPromises()
    return wrapper
}

function input(wrapper: ReturnType<typeof mountView>, name: string) {
    return wrapper.get<HTMLInputElement>(`input[name="${name}"]`)
}

function offeredRoles(wrapper: ReturnType<typeof mountView>) {
    return wrapper.findComponent(VSelect).props('items')
}

async function submit(wrapper: ReturnType<typeof mountView>) {
    await wrapper.get('form').trigger('submit')
    await flushPromises()
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('UserProfileCard', () => {
    it('prefills the profile of the user', async () => {
        const wrapper = await mountCard()

        expect(input(wrapper, 'firstName').element.value).toBe('Grace')
        expect(input(wrapper, 'lastName').element.value).toBe('Hopper')
        expect(input(wrapper, 'email').element.value).toBe('grace@example.com')
        expect(input(wrapper, 'password').element.value).toBe('')
        expect(wrapper.findComponent(VSelect).props('modelValue')).toBe(3)
    })

    it('saves the profile without touching the password when left empty', async () => {
        const update = vi.spyOn(UserApi, 'updateUser').mockResolvedValue(grace)
        const wrapper = await mountCard()

        await input(wrapper, 'firstName').setValue('Rear Admiral Grace')
        await submit(wrapper)

        await vi.waitFor(() =>
            expect(update).toHaveBeenCalledWith({
                path: { userId: 7 },
                body: { firstName: 'Rear Admiral Grace', lastName: 'Hopper', email: 'grace@example.com', roleId: 3 },
            }),
        )
    })

    it('sends a new password and role when changed', async () => {
        const update = vi.spyOn(UserApi, 'updateUser').mockResolvedValue(grace)
        const wrapper = await mountCard()

        await input(wrapper, 'password').setValue('new-secret-1')
        await wrapper.findComponent(VSelect).setValue(2)
        await submit(wrapper)

        await vi.waitFor(() =>
            expect(update).toHaveBeenCalledWith({
                path: { userId: 7 },
                body: {
                    firstName: 'Grace',
                    lastName: 'Hopper',
                    email: 'grace@example.com',
                    roleId: 2,
                    password: 'new-secret-1',
                },
            }),
        )
    })

    it.each([
        ['a new password shorter than 8 characters', 'password', 'short'],
        ['an empty first name', 'firstName', ''],
        ['an invalid email', 'email', 'grace-at-example'],
    ])('rejects %s', async (_, field, value) => {
        const update = vi.spyOn(UserApi, 'updateUser')
        const wrapper = await mountCard()

        await input(wrapper, field).setValue(value)
        await submit(wrapper)

        await vi.waitFor(() => expect(wrapper.findAll('.v-input--error')).toHaveLength(1))
        expect(input(wrapper, field).element.closest('.v-input--error')).not.toBeNull()
        expect(update).not.toHaveBeenCalled()
    })

    it('hides the super admin role from an admin editing a regular user', async () => {
        const wrapper = await mountCard({ caller: 'admin' })

        expect(offeredRoles(wrapper)).toEqual(roles.slice(1))
    })

    it('keeps the super admin role visible when the edited user holds it', async () => {
        const wrapper = await mountCard({
            caller: 'admin',
            user: { ...grace, role: { roleId: 1, name: 'Super Admin', type: 'super_admin' } },
        })

        expect(offeredRoles(wrapper)).toEqual(roles)
    })

    it('offers the super admin role to a super admin', async () => {
        const wrapper = await mountCard({ caller: 'super_admin' })

        expect(offeredRoles(wrapper)).toEqual(roles)
    })

    it('is read-only without the update permission', async () => {
        const wrapper = await mountCard({ rules: [{ action: 'read', subject: 'User' }] })

        for (const name of ['firstName', 'lastName', 'email', 'password']) {
            expect(input(wrapper, name).attributes('disabled')).toBeDefined()
        }
        expect(wrapper.findComponent(VSelect).props('disabled')).toBe(true)
        expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    })

    it('honors conditional update rules for the edited user', async () => {
        const otherUserOnly = await mountCard({
            rules: [{ action: 'update', subject: 'User', conditions: { userId: 8 } }],
        })
        const thisUser = await mountCard({ rules: [{ action: 'update', subject: 'User', conditions: { userId: 7 } }] })

        expect(otherUserOnly.find('button[type="submit"]').exists()).toBe(false)
        expect(thisUser.find('button[type="submit"]').exists()).toBe(true)
    })

    it('shows the API error message', async () => {
        vi.spyOn(UserApi, 'updateUser').mockRejectedValue({ message: 'Email already taken' })
        const wrapper = await mountCard()

        await submit(wrapper)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Email already taken'))
    })

    it('falls back to a generic error and clears it after a successful retry', async () => {
        const update = vi
            .spyOn(UserApi, 'updateUser')
            .mockRejectedValueOnce(new Response(null, { status: 500 }))
            .mockResolvedValueOnce(grace)
        const wrapper = await mountCard()

        await submit(wrapper)
        await vi.waitFor(() => expect(wrapper.text()).toContain('The user could not be updated'))

        await submit(wrapper)
        await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2))
        await vi.waitFor(() => expect(wrapper.text()).not.toContain('The user could not be updated'))
    })
})
