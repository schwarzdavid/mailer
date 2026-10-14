import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UserRoleDto } from 'api'

export function useRoleLabels() {
    const { t } = useI18n()

    return (role: Pick<UserRoleDto, 'type' | 'name'>) => (role.type === 'custom' ? role.name : t(`roles.${role.type}`))
}

export function useRoleLabel(role: MaybeRefOrGetter<Pick<UserRoleDto, 'type' | 'name'> | undefined>) {
    const label = useRoleLabels()

    return computed(() => {
        const value = toValue(role)
        return value ? label(value) : ''
    })
}
