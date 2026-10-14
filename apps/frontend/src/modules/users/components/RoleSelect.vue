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
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
    import { useRoleLabels } from '@/modules/users/composables/useRoleLabel.ts'
    import { useRolesQuery } from '@/modules/users/queries/useRolesQuery.ts'

    const props = withDefaults(defineProps<{ locked?: boolean; lockedHint?: string; keepSuperAdmin?: boolean }>(), {
        locked: false,
        lockedHint: undefined,
        keepSuperAdmin: false,
    })
    const model = defineModel<number | undefined>()

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const roleLabel = useRoleLabels()
    const { data: roles, isLoading } = useQuery(useRolesQuery())
    const { data: currentUser } = useQuery(useAuthQuery())

    const options = computed(() =>
        (roles.value ?? [])
            .filter(
                (role) =>
                    role.type !== 'super_admin' ||
                    currentUser.value?.role.type === 'super_admin' ||
                    props.keepSuperAdmin,
            )
            .map((role) => ({
                roleId: role.roleId,
                name: roleLabel(role),
                description: role.type === 'custom' ? undefined : t(`module.users.roles.${role.type}`),
            })),
    )

    const hint = computed(() => {
        if (props.locked && props.lockedHint) {
            return props.lockedHint
        }
        return options.value.find((option) => option.roleId === model.value)?.description
    })
</script>
