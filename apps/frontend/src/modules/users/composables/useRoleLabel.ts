import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { UserRoleDto } from 'api'

export function useRoleLabels() {
    return (role: Pick<UserRoleDto, 'name'>) => role.name
}

export function useRoleLabel(role: MaybeRefOrGetter<Pick<UserRoleDto, 'name'> | undefined>) {
    const label = useRoleLabels()

    return computed(() => {
        const value = toValue(role)
        return value ? label(value) : ''
    })
}
