import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, RoleApi } from 'api'
import type { Router } from 'vue-router'
import { flushPromises } from '@vue/test-utils'
import AddRoleDialog from '../partials/AddRoleDialog.vue'
import { mountDialog, overlayButton, overlayText, setOverlayInput, submitOverlayForm } from '@/__tests__/support.ts'
import { allRoles, heldAll, heldOnly, projectRoleSummaries } from '@/modules/roles/__tests__/roleFixtures.ts'
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

afterEach(() => {
    vi.restoreAllMocks()
    push.mockReset()
    document.body.innerHTML = ''
})

async function openDialog(held = heldAll()) {
    vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(allRoles())
    const getHeldPermissions = vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(held)
    const result = mountDialog(AddRoleDialog)
    await vi.waitFor(() => expect(document.body.querySelector('input[name="name"]')).not.toBeNull())
    await vi.waitFor(() => expect(getHeldPermissions).toHaveBeenCalled())
    await flushPromises()
    return result
}

async function pickOption(testId: string, label: string) {
    document.body
        .querySelector<HTMLElement>(`.v-overlay-container [data-testid="${testId}"] .v-field`)!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await vi.waitFor(() => expect(document.body.querySelectorAll('.v-list-item').length).toBeGreaterThan(0))
    ;[...document.body.querySelectorAll<HTMLElement>('.v-list-item')]
        .find((item) => item.textContent?.trim() === label)!
        .click()
}

async function optionTitles(testId: string) {
    document.body
        .querySelector<HTMLElement>(`.v-overlay-container [data-testid="${testId}"] .v-field`)!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await vi.waitFor(() => expect(document.body.querySelectorAll('.v-list-item').length).toBeGreaterThan(0))
    return [...document.body.querySelectorAll('.v-list-item-title')].map((title) => title.textContent?.trim())
}

describe('AddRoleDialog', () => {
    it('offers held global roles except Super Admin as templates', async () => {
        await openDialog()

        expect(await optionTitles('startFrom')).toEqual(['Admin', 'User'])
    })

    it('offers only templates whose permissions the caller holds', async () => {
        await openDialog(heldOnly(['users.read']))

        expect(await optionTitles('startFrom')).toEqual(['User'])
    })

    it('creates a global role without permissions and opens its page', async () => {
        push.mockResolvedValue(undefined)
        const create = vi.spyOn(RoleApi, 'createRole').mockResolvedValue({ ...allRoles()[2]!, roleId: 12, name: 'Ops' })
        const { open } = await openDialog()

        await setOverlayInput('name', 'Ops')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(push).toHaveBeenCalledWith({ name: RouteNames.ROLE_DETAILS, params: { roleId: 12 } }),
        )
        expect(create).toHaveBeenCalledWith({
            body: { name: 'Ops', scope: 'global', description: null, permissions: [] },
        })
        expect(open.value).toBe(false)
    })

    it('copies the permissions of a template role in the chosen scope', async () => {
        push.mockResolvedValue(undefined)
        const create = vi.spyOn(RoleApi, 'createRole').mockResolvedValue({ ...projectRoleSummaries()[1]!, roleId: 13 })
        await openDialog()

        await setOverlayInput('name', 'Reviewer')
        await pickOption('scope', 'Project')
        await pickOption('startFrom', 'Editor')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(create).toHaveBeenCalledWith({
                body: { name: 'Reviewer', scope: 'project', description: null, permissions: ['read', 'forms.manage'] },
            }),
        )
    })

    it('starts fresh project roles with read', async () => {
        push.mockResolvedValue(undefined)
        const create = vi.spyOn(RoleApi, 'createRole').mockResolvedValue({ ...projectRoleSummaries()[0]!, roleId: 14 })
        await openDialog()

        await setOverlayInput('name', 'Guest')
        await pickOption('scope', 'Project')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(create).toHaveBeenCalledWith({
                body: { name: 'Guest', scope: 'project', description: null, permissions: ['read'] },
            }),
        )
    })

    it('closes without asking once an entered value is reverted', async () => {
        const { open } = await openDialog()

        await setOverlayInput('name', 'Ops')
        await setOverlayInput('name', '')
        overlayButton('Cancel').click()
        await flushPromises()

        expect(overlayText()).not.toContain('Discard unsaved changes?')
        expect(open.value).toBe(false)
    })

    it('asks before discarding an entered value', async () => {
        const { open } = await openDialog()

        await setOverlayInput('name', 'Ops')
        overlayButton('Cancel').click()

        await vi.waitFor(() => expect(overlayText()).toContain('Discard unsaved changes?'))
        expect(open.value).toBe(true)
    })

    it('keeps the dialog open with the error when creating fails', async () => {
        vi.spyOn(RoleApi, 'createRole').mockRejectedValue({ message: 'Name is already in use' })
        const { open } = await openDialog()

        await setOverlayInput('name', 'Admin')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Name is already in use'))
        expect(open.value).toBe(true)
    })
})
