import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { AuthApi, RoleApi, type AuthPermissionsDto } from 'api'
import RoleSelect from '../RoleSelect.vue'
import { mountInApp } from '@/__tests__/support.ts'
import { signedIn } from '@/modules/users/views/__tests__/userFixtures.ts'
import { allRoles, heldAll, heldNone, heldOnly } from '@/modules/roles/__tests__/roleFixtures.ts'

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

async function mountSelect(
    as: 'super_admin' | 'admin',
    held: AuthPermissionsDto,
    props: { modelValue?: number; includeRoleId?: number } = {},
) {
    const getRoles = vi.spyOn(RoleApi, 'getRoles').mockResolvedValue(allRoles())
    const currentUser = vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(signedIn(as))
    const getHeldPermissions = vi.spyOn(AuthApi, 'getHeldPermissions').mockResolvedValue(held)
    const wrapper = mountInApp(RoleSelect, props)
    await vi.waitFor(() => {
        expect(getRoles).toHaveBeenCalled()
        expect(currentUser).toHaveBeenCalled()
        expect(getHeldPermissions).toHaveBeenCalled()
    })
    await flushPromises()
    return wrapper
}

async function roleOptions(wrapper: Awaited<ReturnType<typeof mountSelect>>) {
    await wrapper.get('.v-field').trigger('mousedown')
    await vi.waitFor(() => expect(document.body.querySelectorAll('.v-list-item').length).toBeGreaterThan(0))
    return [...document.body.querySelectorAll('.v-list-item-title')].map((title) => title.textContent?.trim())
}

describe('RoleSelect', () => {
    it('lists only global roles whose permissions the caller holds', async () => {
        const wrapper = await mountSelect('super_admin', heldOnly(['domains.read']))

        expect(await roleOptions(wrapper)).toEqual(['Super Admin', 'User'])
    })

    it('hides the Super Admin role from non-super-admins', async () => {
        const wrapper = await mountSelect('admin', heldAll())

        expect(await roleOptions(wrapper)).toEqual(['Admin', 'User'])
    })

    it('keeps the included role even when the caller cannot grant it', async () => {
        const wrapper = await mountSelect('admin', heldNone(), { modelValue: 2, includeRoleId: 2 })

        expect(await roleOptions(wrapper)).toEqual(['Admin', 'User'])
    })

    it('shows the description of the selected role as hint', async () => {
        const wrapper = await mountSelect('admin', heldAll(), { modelValue: 3 })

        await vi.waitFor(() => expect(wrapper.text()).toContain('No permissions of its own'))
    })
})
