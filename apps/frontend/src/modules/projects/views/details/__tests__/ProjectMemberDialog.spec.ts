import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { VSelect } from 'vuetify/components'
import type { RawRuleOf } from '@casl/ability'
import { ProjectApi, UserApi, type ProjectMemberDto, type UserDto } from 'api'
import ProjectMemberDialog from '../partials/ProjectMemberDialog.vue'
import { mountView } from '@/__tests__/support.ts'
import type { AppAbility } from '@/plugins/casl.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', undefined)
enableAutoUnmount(afterEach)

const member: ProjectMemberDto = {
    userId: 2,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    permissions: ['read', 'update'],
}

const users: UserDto[] = [
    {
        userId: 3,
        firstName: 'Alan',
        lastName: 'Turing',
        email: 'alan@example.com',
        role: { type: 'user', roleId: 2, name: 'User' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
]

const manager: RawRuleOf<AppAbility>[] = [
    { action: ['read', 'update'], subject: 'Project', conditions: { projectId: 1 } },
    { action: 'read', subject: 'User' },
]

afterEach(() => {
    vi.restoreAllMocks()
})

function dialog() {
    return new DOMWrapper(document.body).get('.v-overlay__content')
}

function saveButton() {
    return dialog()
        .findAll('button')
        .find((button) => button.text() === 'Save')!
}

function checkbox(level: string) {
    return dialog().get(`input[type="checkbox"][value="${level}"]`)
}

async function openDialog(props: { projectId: number; member?: ProjectMemberDto }) {
    const wrapper = mountView(
        ProjectMemberDialog,
        {
            props,
            slots: {
                default: (scope: { props: Record<string, unknown> }) => h('button', { class: 'open', ...scope.props }),
            },
        },
        manager,
    )
    await wrapper.get('button.open').trigger('click')
    await flushPromises()
    return wrapper
}

describe('ProjectMemberDialog', () => {
    it('adds a picked user with read access by default', async () => {
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue(users)
        const setSpy = vi.spyOn(ProjectApi, 'setProjectMember').mockResolvedValue(undefined)
        const wrapper = await openDialog({ projectId: 1 })

        expect(dialog().text()).toContain('Add member')
        expect((checkbox('read').element as HTMLInputElement).checked).toBe(true)
        expect(saveButton().attributes('disabled')).toBeDefined()
        await vi.waitFor(() => {
            expect(wrapper.getComponent(VSelect).props('items')).toEqual([{ userId: 3, name: 'Alan Turing' }])
        })

        await wrapper.getComponent(VSelect).setValue(3)
        await saveButton().trigger('click')

        await vi.waitFor(() => {
            expect(setSpy).toHaveBeenCalledWith({ path: { projectId: 1, userId: 3 }, body: { permissions: ['read'] } })
        })
    })

    it('edits the permissions of an existing member without picking a user', async () => {
        const usersSpy = vi.spyOn(UserApi, 'getUsers').mockResolvedValue(users)
        const setSpy = vi.spyOn(ProjectApi, 'setProjectMember').mockResolvedValue(undefined)
        const wrapper = await openDialog({ projectId: 1, member })

        expect(dialog().text()).toContain('Edit member')
        expect(wrapper.findComponent(VSelect).exists()).toBe(false)
        expect(usersSpy).not.toHaveBeenCalled()
        expect((checkbox('update').element as HTMLInputElement).checked).toBe(true)
        expect((checkbox('delete').element as HTMLInputElement).checked).toBe(false)

        await checkbox('delete').setValue(true)
        await saveButton().trigger('click')

        await vi.waitFor(() => {
            expect(setSpy).toHaveBeenCalledWith({
                path: { projectId: 1, userId: 2 },
                body: { permissions: ['read', 'update', 'delete'] },
            })
        })
    })

    it('cannot save a member without any permission', async () => {
        await openDialog({ projectId: 1, member: { ...member, permissions: ['read'] } })

        await checkbox('read').setValue(false)

        expect(saveButton().attributes('disabled')).toBeDefined()
    })

    it('shows the api error and stays open when saving fails', async () => {
        vi.spyOn(ProjectApi, 'setProjectMember').mockRejectedValue({ message: 'User is already a member' })
        await openDialog({ projectId: 1, member })

        await saveButton().trigger('click')

        await vi.waitFor(() => {
            expect(dialog().get('.v-alert').text()).toContain('User is already a member')
        })
    })
})
