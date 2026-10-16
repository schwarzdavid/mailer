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
            <PermissionGrid
                v-model="selected"
                scope="global"
                :groups="GLOBAL_PERMISSION_GROUPS"
                :locked="rolePermissions"
                :locked-hint="t('module.users.details.permissions.fromRole', { role: user.role.name })"
                :grantable="held?.permissions"
                :readonly="!canUpdate || held === undefined"
            />
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
    import { useAuthPermissionsQuery } from '@/modules/auth/queries/useAuthPermissionsQuery.ts'
    import PermissionGrid from '@/modules/roles/components/PermissionGrid.vue'
    import { GLOBAL_PERMISSION_GROUPS, isGlobalPermission } from '@/modules/roles/permissionCatalog.ts'
    import { useRolesQuery } from '@/modules/roles/queries/useRolesQuery.ts'
    import { useUserPermissionsMutation } from '@/modules/users/mutations/useUserPermissionsMutation.ts'

    const props = defineProps<{ user: UserDetailDto; canUpdate: boolean }>()

    const { t } = useI18n()
    const notify = useNotify()
    const userAbility = useAbility()
    const formId = useId()
    const errorMessage = ref<string | null>(null)
    const selected = ref<Permission[]>([...props.user.permissions])
    const { mutateAsync, isPending } = useUserPermissionsMutation()
    const { queryKey, queryFn } = useRolesQuery()
    const { data: roles } = useQuery({ queryKey, queryFn, enabled: computed(() => userAbility.can('read', 'Role')) })

    const { queryKey: heldKey, queryFn: heldFn } = useAuthPermissionsQuery()
    const { data: held } = useQuery({ queryKey: heldKey, queryFn: heldFn, enabled: computed(() => props.canUpdate) })

    const rolePermissions = computed(() =>
        (roles.value?.find((role) => role.roleId === props.user.role.roleId)?.permissions ?? []).filter(
            isGlobalPermission,
        ),
    )
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
</style>
