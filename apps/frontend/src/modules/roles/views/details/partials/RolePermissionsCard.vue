<template>
    <SectionCard
        :title="t('module.roles.details.permissions.title')"
        :description="t('module.roles.details.permissions.description')"
    >
        <form :id="formId" class="role-permissions" novalidate @submit.prevent="onSave">
            <InlineAlert
                v-if="errorMessage"
                tone="error"
                :title="t('module.roles.details.permissions.error')"
                :text="errorMessage"
            />
            <PermissionGrid
                v-if="role.scope === 'global'"
                scope="global"
                :groups="GLOBAL_PERMISSION_GROUPS"
                :model-value="globalSelected"
                :grantable="held?.permissions"
                :readonly="!canUpdate || held === undefined"
                @update:model-value="onGlobalChange"
            />
            <PermissionGrid
                v-else
                scope="project"
                :groups="PROJECT_PERMISSION_GROUPS"
                :model-value="projectSelected"
                :grantable="held?.projectPermissions"
                :required="REQUIRED_PROJECT_PERMISSIONS"
                :readonly="!canUpdate || held === undefined"
                @update:model-value="onProjectChange"
            />
            <p v-if="role.scope === 'project'" class="role-permissions__note">
                {{ t('module.roles.details.permissions.readRequired') }}
            </p>
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
    import type { CatalogPermission, Permission, ProjectPermission, RoleDto } from 'api'
    import InlineAlert from '@/components/InlineAlert.vue'
    import SaveFooter from '@/components/SaveFooter.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useDirtyGuard } from '@/composables/useDirtyGuard.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useAuthPermissionsQuery } from '@/modules/auth/queries/useAuthPermissionsQuery.ts'
    import PermissionGrid from '@/modules/roles/components/PermissionGrid.vue'
    import { useRoleUpdateMutation } from '@/modules/roles/mutations/useRoleUpdateMutation.ts'
    import {
        GLOBAL_PERMISSION_GROUPS,
        isGlobalPermission,
        isProjectPermission,
        PROJECT_PERMISSION_GROUPS,
    } from '@/modules/roles/permissionCatalog.ts'

    const REQUIRED_PROJECT_PERMISSIONS: ProjectPermission[] = ['read']

    const props = defineProps<{ role: RoleDto; canUpdate: boolean }>()

    const { t } = useI18n()
    const notify = useNotify()
    const formId = useId()
    const errorMessage = ref<string | null>(null)
    const selected = ref<CatalogPermission[]>([...props.role.permissions])
    const { mutateAsync, isPending } = useRoleUpdateMutation()
    const { queryKey, queryFn } = useAuthPermissionsQuery()
    const { data: held } = useQuery({ queryKey, queryFn, enabled: computed(() => props.canUpdate) })

    const globalSelected = computed(() => selected.value.filter(isGlobalPermission))
    const projectSelected = computed(() => selected.value.filter(isProjectPermission))
    const sortedKey = (permissions: CatalogPermission[]) => [...permissions].sort().join()
    const dirty = computed(() => sortedKey(selected.value) !== sortedKey(props.role.permissions))

    useDirtyGuard(dirty)

    watch(
        () => props.role.permissions,
        (permissions) => {
            if (!dirty.value) {
                selected.value = [...permissions]
            }
        },
    )

    function onGlobalChange(value: Permission[]) {
        selected.value = value
    }

    function onProjectChange(value: ProjectPermission[]) {
        selected.value = value
    }

    function discard() {
        errorMessage.value = null
        selected.value = [...props.role.permissions]
    }

    async function onSave() {
        errorMessage.value = null
        try {
            await mutateAsync({ roleId: props.role.roleId, body: { permissions: selected.value } })
            notify.success(t('module.roles.details.permissions.saved'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('dialog.tryAgain'))
        }
    }
</script>

<style scoped>
    .role-permissions {
        display: grid;
        gap: 20px;
    }

    .role-permissions__note {
        margin: 0;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
    }
</style>
