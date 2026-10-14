import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, RoleApi, UserApi } from 'api'
import type { Router } from 'vue-router'
import AddUserDialog from '../partials/AddUserDialog.vue'
import { mountDialog, overlayText, setOverlayInput, submitOverlayForm } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'
import { roles, signedIn } from '../../__tests__/userFixtures.ts'

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

async function openDialog(as: 'super_admin' | 'admin' = 'super_admin') {
    vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(roles)
    vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(signedIn(as))
    const result = mountDialog(AddUserDialog)
    await vi.waitFor(() => expect(document.body.querySelector('input[name="firstName"]')).not.toBeNull())
    await vi.waitFor(() => expect(overlayText()).toContain('No permissions of its own'))
    return result
}

async function fillForm() {
    await setOverlayInput('firstName', 'Nina')
    await setOverlayInput('lastName', 'Roth')
    await setOverlayInput('email', 'nina@acme.com')
    await setOverlayInput('password', 'correct-horse')
}

async function roleOptions() {
    document.body
        .querySelector<HTMLElement>('.v-overlay-container .v-select .v-field')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await vi.waitFor(() => expect(document.body.querySelectorAll('.v-list-item').length).toBeGreaterThan(0))
    return [...document.body.querySelectorAll('.v-list-item-title')].map((title) => title.textContent?.trim())
}

describe('AddUserDialog', () => {
    it('preselects the User role and explains it', async () => {
        await openDialog()

        expect(overlayText()).toContain('No permissions of its own')
    })

    it('hides the Super admin role from admins', async () => {
        await openDialog('admin')

        expect(await roleOptions()).toEqual(['Admin', 'User'])
    })

    it('offers the Super admin role to Super admins', async () => {
        await openDialog('super_admin')

        expect(await roleOptions()).toEqual(['Super admin', 'Admin', 'User'])
    })

    it('creates the user and opens the detail page', async () => {
        push.mockResolvedValue(undefined)
        const create = vi.spyOn(UserApi, 'createUser').mockResolvedValue(signedIn('user', 9))
        const { open } = await openDialog()

        await fillForm()
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(push).toHaveBeenCalledWith({ name: RouteNames.USER_DETAILS, params: { userId: 9 } }),
        )
        expect(create).toHaveBeenCalledWith({
            body: { firstName: 'Nina', lastName: 'Roth', email: 'nina@acme.com', password: 'correct-horse', roleId: 3 },
        })
        expect(open.value).toBe(false)
    })

    it('does not create a user from an incomplete form', async () => {
        const create = vi.spyOn(UserApi, 'createUser')
        await openDialog()

        await setOverlayInput('firstName', 'Nina')
        submitOverlayForm()

        await vi.waitFor(() => expect(document.body.querySelector('.v-input--error')).not.toBeNull())
        expect(create).not.toHaveBeenCalled()
    })

    it('keeps the dialog open with the error when creating fails', async () => {
        vi.spyOn(UserApi, 'createUser').mockRejectedValue({ message: 'Email already in use' })
        const { open } = await openDialog()

        await fillForm()
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Email already in use'))
        expect(open.value).toBe(true)
    })
})
