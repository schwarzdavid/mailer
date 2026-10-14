<template>
    <SectionCard
        :title="t('module.users.details.permissions.title')"
        :description="t('module.users.details.permissions.description')"
    >
        <form :id="formId" class="user-permissions" novalidate @submit.prevent="onSave">
            <InlineAlert
                v-if="errorMessage"
                tone="error"
                :title="t('module.users.details.permissions.error')"
                :text="errorMessage"
            />
            <InlineAlert
                tone="info"
                :title="t('module.users.details.permissions.explainer.title')"
                :text="t('module.users.details.permissions.explainer.text')"
            />
            <div class="user-permissions__grid">
                <fieldset
                    v-for="(groupPermissions, group) in PERMISSION_GROUPS"
                    :key="group"
                    class="user-permissions__group"
                >
                    <legend>{{ t(`permissions.groups.${group}`) }}</legend>
                    <VCheckbox
                        v-for="permission in groupPermissions"
                        :key="permission"
                        :value="permission"
                        :label="t(`permissions.labels.${permission.replace('.', '_')}`)"
                        :disabled="!canUpdate || fromRole(permission)"
                        :model-value="effective"
                        :messages="
                            fromRole(permission)
                                ? t('module.users.details.permissions.fromRole', { role: roleLabel(user.role) })
                                : undefined
                        "
                        hide-details="auto"
                        @update:model-value="onChange"
                    />
                </fieldset>
            </div>
        </form>
        <template v-if="canUpdate" #footer>
            <SaveFooter :form="formId" :dirty="dirty" :pending="isPending" @discard="discard" />
        </template>
    </SectionCard>
</template>

<script setup lang="ts">
    import { computed, ref, useId, watch } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import type { Permission, UserDetailDto } from 'api'
    import InlineAlert from '@/components/InlineAlert.vue'
    import SaveFooter from '@/components/SaveFooter.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useDirtyGuard } from '@/composables/useDirtyGuard.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useRoleLabels } from '@/modules/users/composables/useRoleLabel.ts'
    import { PERMISSION_GROUPS } from '@/modules/users/permissionGroups.ts'
    import { useUserPermissionsMutation } from '@/modules/users/mutations/useUserPermissionsMutation.ts'
    import { useRolesQuery } from '@/modules/users/queries/useRolesQuery.ts'

    const props = defineProps<{ user: UserDetailDto; canUpdate: boolean }>()

    const { t } = useI18n()
    const notify = useNotify()
    const roleLabel = useRoleLabels()
    const userAbility = useAbility()
    const formId = useId()
    const errorMessage = ref<string | null>(null)
    const selected = ref<Permission[]>([...props.user.permissions])
    const { mutateAsync, isPending } = useUserPermissionsMutation()
    const { queryKey, queryFn } = useRolesQuery()
    const { data: roles } = useQuery({ queryKey, queryFn, enabled: computed(() => userAbility.can('read', 'Role')) })

    const rolePermissions = computed(
        () => roles.value?.find((role) => role.roleId === props.user.role.roleId)?.permissions ?? [],
    )
    const effective = computed(() => [...new Set([...selected.value, ...rolePermissions.value])])
    const direct = (permissions: Permission[]) =>
        permissions
            .filter((permission) => !fromRole(permission))
            .sort()
            .join()
    const dirty = computed(() => direct(selected.value) !== direct(props.user.permissions))

    useDirtyGuard(dirty)

    watch(
        () => props.user.permissions,
        (permissions) => {
            if (!dirty.value) {
                selected.value = [...permissions]
            }
        },
    )

    function fromRole(permission: Permission) {
        return rolePermissions.value.includes(permission)
    }

    function onChange(value: Permission[] | null) {
        selected.value = (value ?? []).filter((permission) => !fromRole(permission))
    }

    function discard() {
        errorMessage.value = null
        selected.value = [...props.user.permissions]
    }

    async function onSave() {
        errorMessage.value = null
        try {
            await mutateAsync({
                userId: props.user.userId,
                permissions: selected.value.filter((permission) => !fromRole(permission)),
            })
            notify.success(t('module.users.details.permissions.saved'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('dialog.tryAgain'))
        }
    }
</script>

<style scoped>
    .user-permissions {
        display: grid;
        gap: 20px;
    }

    .user-permissions__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 20px 24px;
    }

    .user-permissions__group {
        margin: 0;
        padding: 0;
        border: 0;
    }

    .user-permissions__group legend {
        margin-bottom: 4px;
        font-size: 0.875rem;
        font-weight: 600;
        line-height: 1.25rem;
    }
</style>
