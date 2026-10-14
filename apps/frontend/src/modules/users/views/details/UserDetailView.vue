<template>
    <PageHeader :title="fullName" :loading="isPending" :breadcrumbs="breadcrumbs">
        <template v-if="user" #status>
            <TagLabel :label="roleLabel(user.role)" />
        </template>
        <template v-if="user" #meta>
            <span class="mono">{{ user.email }}</span>
            <span v-if="user.role.type !== 'super_admin'">
                {{ t('module.users.details.memberOf', { count: user.memberships.length }, user.memberships.length) }}
            </span>
        </template>
    </PageHeader>

    <ErrorState
        v-if="isError"
        :kind="apiErrorStatus(error) === 404 ? 'notFound' : 'load'"
        size="page"
        :thing="t('module.users.details.thing')"
        :error="error"
        :retrying="isFetching"
        @retry="refetch()"
    >
        <template #actions>
            <VBtn variant="text" :to="{ name: RouteNames.USER_LIST }" :text="t('module.users.details.backToList')" />
        </template>
    </ErrorState>
    <PageSkeleton v-else-if="isPending" :cards="2" :label="t('module.users.details.loading')" />
    <div v-else-if="user" class="page-stack">
        <UserProfileCard :user="user" :can-update="canUpdate" :is-self="isSelf" />
        <InlineAlert
            v-if="user.role.type === 'super_admin'"
            tone="info"
            :title="t('module.users.details.superAdmin.title')"
            :text="t('module.users.details.superAdmin.text')"
        />
        <template v-else>
            <UserPermissionsCard :user="user" :can-update="canUpdate" />
            <UserMembershipsCard :user="user" />
        </template>
        <SectionCard
            v-if="canDelete"
            danger
            :title="t('module.users.delete.title')"
            :description="
                t(
                    'module.users.delete.description',
                    { name: fullName, count: user.memberships.length },
                    user.memberships.length,
                )
            "
        >
            <template #actions>
                <VBtn
                    color="error"
                    :text="t('module.users.list.delete')"
                    @click="deleteUser(user, user.memberships.length, true)"
                />
            </template>
        </SectionCard>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useRoute } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import ErrorState from '@/components/ErrorState.vue'
    import InlineAlert from '@/components/InlineAlert.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import TagLabel from '@/components/TagLabel.vue'
    import PageSkeleton from '@/components/skeletons/PageSkeleton.vue'
    import { apiErrorStatus } from '@/helper/apiErrorStatus.ts'
    import { useDeleteUser } from '@/modules/users/composables/useDeleteUser.ts'
    import { useRoleLabels } from '@/modules/users/composables/useRoleLabel.ts'
    import { useUserPermissions } from '@/modules/users/composables/useUserPermissions.ts'
    import { useUserQuery } from '@/modules/users/queries/useUserQuery.ts'
    import UserMembershipsCard from '@/modules/users/views/details/partials/UserMembershipsCard.vue'
    import UserPermissionsCard from '@/modules/users/views/details/partials/UserPermissionsCard.vue'
    import UserProfileCard from '@/modules/users/views/details/partials/UserProfileCard.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const route = useRoute()
    const roleLabel = useRoleLabels()
    const deleteUser = useDeleteUser()
    const {
        data: user,
        isPending,
        isError,
        error,
        isFetching,
        refetch,
    } = useQuery(useUserQuery(() => Number(route.params.userId)))
    const { isSelf, canUpdate, canDelete } = useUserPermissions(user)

    const fullName = computed(() => (user.value ? `${user.value.firstName} ${user.value.lastName}` : ''))
    const breadcrumbs = computed(() => [{ title: t('nav.users'), to: { name: RouteNames.USER_LIST } }])
</script>
