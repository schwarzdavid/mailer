import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { VApp, VBtn } from 'vuetify/components'
import { UserApi, type UserDto } from 'api'
import DeleteUserDialog from '../partials/DeleteUserDialog.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

const user: UserDto = {
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
            h(
                DeleteUserDialog,
                { user },
                {
                    default: ({ props }: { props: Record<string, unknown> }) =>
                        h(VBtn, { ...props, class: 'open-dialog' }, () => 'Remove'),
                },
            ),
        ),
})

async function openDialog() {
    const wrapper = mountView(DialogHost)
    await wrapper.get('.open-dialog').trigger('click')
    await vi.waitFor(() => expect(dialogText()).toContain('Delete User'))
    return wrapper
}

function dialogText() {
    return document.body.querySelector('.v-overlay-container')?.textContent ?? ''
}

function isOpen() {
    return document.body.querySelector('.v-overlay--active') !== null
}

async function clickDialogButton(label: string) {
    const button = [...document.body.querySelectorAll<HTMLButtonElement>('.v-overlay-container button')].find(
        (candidate) => candidate.textContent?.trim() === label,
    )
    button!.click()
    await flushPromises()
}

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('DeleteUserDialog', () => {
    it('asks to confirm the deletion of the named user', async () => {
        const wrapper = await openDialog()

        expect(dialogText()).toContain('Do you really want to delete Grace Hopper? This cannot be undone.')
        wrapper.unmount()
    })

    it('does nothing when aborted', async () => {
        const remove = vi.spyOn(UserApi, 'deleteUser')
        const wrapper = await openDialog()

        await clickDialogButton('Abort')

        await vi.waitFor(() => expect(isOpen()).toBe(false))
        expect(remove).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('deletes the user and closes', async () => {
        const remove = vi.spyOn(UserApi, 'deleteUser').mockResolvedValue(undefined)
        const wrapper = await openDialog()

        await clickDialogButton('Delete')

        await vi.waitFor(() => expect(isOpen()).toBe(false))
        expect(remove).toHaveBeenCalledWith({ path: { userId: 7 } })
        wrapper.unmount()
    })

    it('shows the API error and stays open when deletion fails', async () => {
        vi.spyOn(UserApi, 'deleteUser').mockRejectedValue({ message: 'You cannot delete the last super admin' })
        const wrapper = await openDialog()

        await clickDialogButton('Delete')

        await vi.waitFor(() => expect(dialogText()).toContain('You cannot delete the last super admin'))
        expect(isOpen()).toBe(true)
        wrapper.unmount()
    })

    it('falls back to a generic error without a message', async () => {
        vi.spyOn(UserApi, 'deleteUser').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = await openDialog()

        await clickDialogButton('Delete')

        await vi.waitFor(() => expect(dialogText()).toContain('The user could not be deleted'))
        wrapper.unmount()
    })
})
