<template>
    <VSelect
        v-model="model"
        name="roleId"
        :label="requiredLabel(t('field.role'))"
        :items="options"
        item-title="name"
        item-value="roleId"
        :hint="hint"
        persistent-hint
        :loading="isLoading"
        :disabled="locked"
        aria-required="true"
    >
        <template #item="{ props: itemProps, item }">
            <VListItem v-bind="itemProps" :subtitle="item.description" />
        </template>
    </VSelect>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import type { RoleDto } from 'api'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
    import { useAuthPermissionsQuery } from '@/modules/auth/queries/useAuthPermissionsQuery.ts'
    import { useRolesQuery } from '@/modules/roles/queries/useRolesQuery.ts'

    const props = withDefaults(defineProps<{ locked?: boolean; lockedHint?: string; includeRoleId?: number }>(), {
        locked: false,
        lockedHint: undefined,
        includeRoleId: undefined,
    })
    const model = defineModel<number | undefined>()

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const { data: roles, isLoading } = useQuery(useRolesQuery())
    const { data: currentUser } = useQuery(useAuthQuery())
    const { data: held } = useQuery(useAuthPermissionsQuery())

    const heldPermissions = computed(() => new Set<string>(held.value?.permissions ?? []))

    function isGrantable(role: RoleDto) {
        if (role.type === 'super_admin' && currentUser.value?.role.type !== 'super_admin') {
            return false
        }
        return role.permissions.every((permission) => heldPermissions.value.has(permission))
    }

    const options = computed(() =>
        (roles.value ?? [])
            .filter((role) => role.scope === 'global' && (isGrantable(role) || role.roleId === props.includeRoleId))
            .map((role) => ({ roleId: role.roleId, name: role.name, description: role.description ?? undefined })),
    )

    const hint = computed(() => {
        if (props.locked && props.lockedHint) {
            return props.lockedHint
        }
        return options.value.find((option) => option.roleId === model.value)?.description
    })
</script>
