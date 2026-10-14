import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { VApp, VBtn, VSelect } from 'vuetify/components'
import { AuthApi, RoleApi, UserApi, type RoleDto, type UserDto } from 'api'
import type { Router } from 'vue-router'
import AddUserDialog from '../partials/AddUserDialog.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

const roles: RoleDto[] = [
    { roleId: 1, name: 'Super Admin', type: 'super_admin', permissions: [] },
    { roleId: 2, name: 'Admin', type: 'admin', permissions: [] },
    { roleId: 3, name: 'User', type: 'user', permissions: [] },
]

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

const created: UserDto = {
    userId: 7,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    role: { roleId: 3, name: 'User', type: 'user' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

const DialogHost = defineComponent({
    setup: () => () =>
        h(VApp, () =>
            h(AddUserDialog, null, {
                default: ({ props }: { props: Record<string, unknown> }) =>
                    h(VBtn, { ...props, class: 'open-dialog' }, () => 'Add'),
            }),
        ),
})

async function openDialog(callerRole: UserDto['role']['type'] = 'admin') {
    vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(buildCaller(callerRole))
    const wrapper = mountView(DialogHost)
    await wrapper.get('.open-dialog').trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector('input[name="firstName"]')).not.toBeNull())
    await flushPromises()
    return wrapper
}

function input(name: string) {
    return document.body.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
}

async function fill(values: Record<string, string>) {
    for (const [name, value] of Object.entries(values)) {
        input(name).value = value
        input(name).dispatchEvent(new Event('input'))
    }
    await flushPromises()
}

async function fillValid() {
    await fill({ firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', password: 'cobol-1959' })
}

async function submit() {
    document.body.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()
}

function dialogText() {
    return document.body.querySelector('.v-overlay-container')?.textContent ?? ''
}

function offeredRoles(wrapper: ReturnType<typeof mountView>) {
    return wrapper.findComponent(VSelect).props('items')
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
    document.body.innerHTML = ''
})

describe('AddUserDialog', () => {
    it('opens with the form and intro', async () => {
        const wrapper = await openDialog()

        expect(dialogText()).toContain('New User')
        expect(dialogText()).toContain('share the initial password')
        expect(input('password').type).toBe('password')
        wrapper.unmount()
    })

    it('hides the super admin role from an admin', async () => {
        const wrapper = await openDialog('admin')

        await vi.waitFor(() => expect(offeredRoles(wrapper)).toEqual(roles.slice(1)))
        wrapper.unmount()
    })

    it('offers the super admin role to a super admin', async () => {
        const wrapper = await openDialog('super_admin')

        await vi.waitFor(() => expect(offeredRoles(wrapper)).toEqual(roles))
        wrapper.unmount()
    })

    it('does not create a user from an empty form', async () => {
        const create = vi.spyOn(UserApi, 'createUser')
        const wrapper = await openDialog()

        await submit()

        await vi.waitFor(() => expect(document.body.querySelectorAll('.v-input--error')).toHaveLength(4))
        expect(create).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it.each([
        ['an invalid email', { email: 'grace-at-example' }, 'email'],
        ['a password shorter than 8 characters', { password: 'short' }, 'password'],
    ])('rejects %s', async (_, override, field) => {
        const create = vi.spyOn(UserApi, 'createUser')
        const wrapper = await openDialog()

        await fillValid()
        await fill(override)
        await submit()

        await vi.waitFor(() => expect(input(field).closest('.v-input--error')).not.toBeNull())
        expect(document.body.querySelectorAll('.v-input--error')).toHaveLength(1)
        expect(create).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('creates the user with the chosen role and opens the detail page', async () => {
        const create = vi.spyOn(UserApi, 'createUser').mockResolvedValue(created)
        const wrapper = await openDialog()

        await fillValid()
        await wrapper.findComponent(VSelect).setValue(3)
        await submit()

        await vi.waitFor(() => {
            expect(push).toHaveBeenCalledWith({ name: RouteNames.USER_DETAILS, params: { userId: 7 } })
        })
        expect(create).toHaveBeenCalledWith({
            body: {
                firstName: 'Grace',
                lastName: 'Hopper',
                email: 'grace@example.com',
                password: 'cobol-1959',
                roleId: 3,
            },
        })
        wrapper.unmount()
    })

    it('creates a user without a role so the server default applies', async () => {
        const create = vi.spyOn(UserApi, 'createUser').mockResolvedValue(created)
        const wrapper = await openDialog()

        await fillValid()
        await submit()

        await vi.waitFor(() => expect(create).toHaveBeenCalled())
        expect(create.mock.calls[0]![0].body).not.toHaveProperty('roleId', expect.anything())
        wrapper.unmount()
    })

    it('shows the API error message and stays open', async () => {
        vi.spyOn(UserApi, 'createUser').mockRejectedValue({ message: 'Email already taken' })
        const wrapper = await openDialog()

        await fillValid()
        await submit()

        await vi.waitFor(() => expect(dialogText()).toContain('Email already taken'))
        expect(push).not.toHaveBeenCalled()
        expect(input('firstName').value).toBe('Grace')
        wrapper.unmount()
    })

    it('falls back to a generic error without a message', async () => {
        vi.spyOn(UserApi, 'createUser').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = await openDialog()

        await fillValid()
        await submit()

        await vi.waitFor(() => expect(dialogText()).toContain('The user could not be created'))
        wrapper.unmount()
    })
})
