import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import type { Permission } from 'api'
import PermissionGrid from '../PermissionGrid.vue'
import { mountView } from '@/__tests__/support.ts'
import { GLOBAL_PERMISSION_GROUPS, isGlobalPermission } from '@/modules/roles/permissionCatalog.ts'

function mountGrid(options: {
    selected?: Permission[]
    locked?: Permission[]
    grantable?: Permission[]
    required?: Permission[]
    readonly?: boolean
}) {
    const selected = ref<Permission[]>(options.selected ?? [])
    const Host = defineComponent({
        setup: () => () =>
            h(PermissionGrid, {
                scope: 'global',
                groups: GLOBAL_PERMISSION_GROUPS,
                modelValue: selected.value,
                'onUpdate:modelValue': (value: string[]) => (selected.value = value.filter(isGlobalPermission)),
                locked: options.locked,
                lockedHint: 'From role: Admin',
                grantable: options.grantable,
                required: options.required,
                readonly: options.readonly,
            }),
    })
    const wrapper = mountView(Host)
    const input = (permission: string) => wrapper.get(`input[value="${permission}"]`).element as HTMLInputElement
    return { wrapper, selected, input }
}

describe('PermissionGrid', () => {
    it('renders every group with its labels and the current selection', () => {
        const { wrapper, input } = mountGrid({ selected: ['users.read'] })

        expect(wrapper.text()).toContain('Roles')
        expect(wrapper.text()).toContain('Create roles')
        expect(input('users.read').checked).toBe(true)
        expect(input('users.create').checked).toBe(false)
    })

    it('shows locked permissions as checked, disabled and explained', () => {
        const { wrapper, input } = mountGrid({ locked: ['domains.read'] })

        expect(input('domains.read').checked).toBe(true)
        expect(input('domains.read').disabled).toBe(true)
        expect(wrapper.text()).toContain('From role: Admin')
    })

    it('disables permissions the caller does not hold', () => {
        const { wrapper, input } = mountGrid({ grantable: ['users.read'] })

        expect(input('users.read').disabled).toBe(false)
        expect(input('users.delete').disabled).toBe(true)
        expect(wrapper.text()).toContain("You don't hold this permission")
    })

    it('emits the selection without locked entries and with required ones', async () => {
        const { wrapper, selected } = mountGrid({ locked: ['domains.read'], required: ['users.read'] })

        await wrapper.get('input[value="users.create"]').setValue(true)

        expect(selected.value).toEqual(['users.read', 'users.create'])
    })

    it('disables everything when read-only', () => {
        const { input } = mountGrid({ readonly: true, grantable: ['users.read'] })

        expect(input('users.read').disabled).toBe(true)
    })
})
