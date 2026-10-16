<template>
    <PageHeader :title="t('module.roles.list.title')" :description="t('module.roles.list.description')">
        <template v-if="canCreate" #actions>
            <VBtn
                variant="flat"
                color="primary"
                :prepend-icon="mdiPlus"
                :text="t('module.roles.list.create')"
                @click="createOpen = true"
            />
        </template>
    </PageHeader>

    <ErrorState
        v-if="isError"
        size="page"
        :thing="t('module.roles.list.thing')"
        :error="error"
        :retrying="isFetching"
        @retry="refetch()"
    />
    <PageSkeleton v-else-if="isPending" :cards="2" :label="t('module.roles.list.loading')" />
    <div v-else-if="roles" class="page-stack">
        <SectionCard
            v-for="scope in SCOPES"
            :key="scope"
            :title="t(`module.roles.list.${scope}.title`)"
            :description="t(`module.roles.list.${scope}.description`)"
            :count="byScope(scope).length"
            :refetching="isFetching"
            flush
        >
            <ListRow
                v-for="role in byScope(scope)"
                :key="role.roleId"
                :icon="mdiShieldAccountOutline"
                :subtitle="role.description ?? undefined"
                :to="{ name: RouteNames.ROLE_DETAILS, params: { roleId: role.roleId } }"
            >
                <template #title>
                    {{ role.name }}
                    <TagLabel v-if="role.type === 'super_admin'" :label="t('module.roles.system')" />
                </template>
                <template #meta>
                    <span class="role-meta">{{ permissionSummary(role) }}</span>
                    <span class="role-meta">{{ assignmentSummary(role) }}</span>
                </template>
            </ListRow>
        </SectionCard>
    </div>

    <AddRoleDialog v-if="canCreate" v-model="createOpen" />
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { mdiPlus, mdiShieldAccountOutline } from '@mdi/js'
    import type { RoleDto, RoleScope } from 'api'
    import ErrorState from '@/components/ErrorState.vue'
    import ListRow from '@/components/ListRow.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import TagLabel from '@/components/TagLabel.vue'
    import PageSkeleton from '@/components/skeletons/PageSkeleton.vue'
    import { useRolesQuery } from '@/modules/roles/queries/useRolesQuery.ts'
    import AddRoleDialog from '@/modules/roles/views/list/partials/AddRoleDialog.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const SCOPES: RoleScope[] = ['global', 'project']

    const { t } = useI18n()
    const userAbility = useAbility()
    const { data: roles, isPending, isError, error, isFetching, refetch } = useQuery(useRolesQuery())
    const createOpen = ref(false)

    const canCreate = computed(() => userAbility.can('create', 'Role'))

    function byScope(scope: RoleScope) {
        return (roles.value ?? []).filter((role) => role.scope === scope)
    }

    function permissionSummary(role: RoleDto) {
        if (role.type === 'super_admin') {
            return t('module.roles.list.allPermissions')
        }
        return t('module.roles.list.permissionCount', { count: role.permissions.length }, role.permissions.length)
    }

    function assignmentSummary(role: RoleDto) {
        const key = role.scope === 'global' ? 'module.roles.list.userCount' : 'module.roles.list.memberCount'
        return t(key, { count: role.assignmentCount }, role.assignmentCount)
    }
</script>

<style scoped>
    .role-meta {
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
        font-variant-numeric: tabular-nums;
    }
</style>
