import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useAbility } from '@casl/vue'
import { subject } from '@casl/ability'
import type { UserDto } from 'api'
import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'

export function useUserPermissions(user: MaybeRefOrGetter<UserDto | undefined>) {
    const userAbility = useAbility()
    const { data: currentUser } = useQuery(useAuthQuery())

    const isSelf = computed(() => !!currentUser.value && currentUser.value.userId === toValue(user)?.userId)
    const canUpdate = computed(() => {
        const target = toValue(user)
        return !!target && userAbility.can('update', subject('User', { ...target }))
    })
    const canDelete = computed(() => {
        const target = toValue(user)
        return !!target && !isSelf.value && userAbility.can('delete', subject('User', { ...target }))
    })
    const isSuperAdmin = computed(() => currentUser.value?.role.type === 'super_admin')

    return { currentUser, isSelf, canUpdate, canDelete, isSuperAdmin }
}
