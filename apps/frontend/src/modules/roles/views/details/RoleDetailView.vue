<template>
    <PageHeader :title="role?.name" :loading="isPending" :breadcrumbs="breadcrumbs">
        <template v-if="role" #status>
            <TagLabel :label="t(`module.roles.scope.${role.scope}`)" />
            <TagLabel v-if="isSystem" :label="t('module.roles.system')" />
        </template>
        <template v-if="role" #meta>
            <span>{{ assignmentSummary }}</span>
            <RouterLink
                v-if="role.scope === 'global' && canReadUsers"
                :to="{ name: RouteNames.USER_LIST }"
                class="row-link"
            >
                {{ t('module.roles.details.manageUsers') }}
            </RouterLink>
        </template>
    </PageHeader>

    <ErrorState
        v-if="isError"
        :kind="apiErrorStatus(error) === 404 ? 'notFound' : 'load'"
        size="page"
        :thing="t('module.roles.details.thing')"
        :error="error"
        :retrying="isFetching"
        @retry="refetch()"
    >
        <template #actions>
            <VBtn variant="text" :to="{ name: RouteNames.ROLE_LIST }" :text="t('module.roles.details.backToList')" />
        </template>
    </ErrorState>
    <PageSkeleton v-else-if="isPending" :cards="2" :label="t('module.roles.details.loading')" />
    <div v-else-if="role" class="page-stack">
        <InlineAlert
            v-if="isSystem"
            tone="info"
            :title="t('module.roles.details.system.title')"
            :text="t('module.roles.details.system.text')"
        />
        <RoleProfileCard :role="role" :can-update="canUpdate" />
        <RolePermissionsCard v-if="!isSystem" :role="role" :can-update="canUpdate" />
        <SectionCard
            v-if="canDelete"
            danger
            :title="t('module.roles.delete.title')"
            :description="
                role.assignmentCount > 0
                    ? t('module.roles.delete.blocked', { name: role.name })
                    : t('module.roles.delete.description', { name: role.name })
            "
        >
            <template v-if="role.assignmentCount === 0" #actions>
                <VBtn color="error" :text="t('module.roles.delete.action')" @click="confirmDelete" />
            </template>
        </SectionCard>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery, useQueryClient } from '@tanstack/vue-query'
    import { useRoute, useRouter } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import ErrorState from '@/components/ErrorState.vue'
    import InlineAlert from '@/components/InlineAlert.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import TagLabel from '@/components/TagLabel.vue'
    import PageSkeleton from '@/components/skeletons/PageSkeleton.vue'
    import { useConfirm } from '@/composables/useConfirm.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { apiErrorStatus } from '@/helper/apiErrorStatus.ts'
    import { useRoleDeleteMutation } from '@/modules/roles/mutations/useRoleDeleteMutation.ts'
    import { useRoleQuery } from '@/modules/roles/queries/useRoleQuery.ts'
    import RolePermissionsCard from '@/modules/roles/views/details/partials/RolePermissionsCard.vue'
    import RoleProfileCard from '@/modules/roles/views/details/partials/RoleProfileCard.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const route = useRoute()
    const router = useRouter()
    const userAbility = useAbility()
    const confirm = useConfirm()
    const notify = useNotify()
    const queryClient = useQueryClient()
    const { mutateAsync: deleteRole } = useRoleDeleteMutation()
    const {
        data: role,
        isPending,
        isError,
        error,
        isFetching,
        refetch,
    } = useQuery(useRoleQuery(() => Number(route.params.roleId)))

    const isSystem = computed(() => role.value?.type === 'super_admin')
    const canUpdate = computed(() => !isSystem.value && userAbility.can('update', 'Role'))
    const canDelete = computed(() => !isSystem.value && userAbility.can('delete', 'Role'))
    const canReadUsers = computed(() => userAbility.can('read', 'User'))

    const breadcrumbs = computed(() => [{ title: t('nav.roles'), to: { name: RouteNames.ROLE_LIST } }])

    const assignmentSummary = computed(() => {
        if (!role.value) {
            return ''
        }
        const key =
            role.value.scope === 'global'
                ? 'module.roles.details.assignedUsers'
                : 'module.roles.details.assignedMembers'
        return t(key, { count: role.value.assignmentCount }, role.value.assignmentCount)
    })

    async function confirmDelete() {
        if (!role.value) {
            return
        }
        const { name, roleId } = role.value
        const confirmed = await confirm({
            title: t('module.roles.delete.confirmTitle', { name }),
            body: t('module.roles.delete.confirmBody'),
            confirmLabel: t('module.roles.delete.confirm'),
            destructive: true,
            errorText: t('module.roles.delete.error'),
            action: () => deleteRole(roleId),
        })
        if (!confirmed) {
            return
        }
        await router.push({ name: RouteNames.ROLE_LIST })
        queryClient.removeQueries({ queryKey: ['roles', roleId], exact: true })
        notify.success(t('module.roles.delete.done', { name }))
    }
</script>
