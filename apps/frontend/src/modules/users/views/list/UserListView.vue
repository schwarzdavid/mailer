<template>
    <PageHeader :title="t('module.users.list.title')" :description="t('module.users.list.description')">
        <template v-if="canCreate" #actions>
            <VBtn
                variant="flat"
                color="primary"
                :prepend-icon="mdiPlus"
                :text="t('module.users.list.create')"
                @click="createOpen = true"
            />
        </template>
    </PageHeader>

    <ErrorState
        v-if="isError"
        size="page"
        :thing="t('module.users.list.thing')"
        :error="error"
        :retrying="isFetching"
        @retry="refetch()"
    />
    <VCard v-else class="user-table">
        <TableSkeleton v-if="isPending" :columns="3" :rows="4" :label="t('module.users.list.loading')" />
        <VDataTable
            v-else
            :headers="headers"
            :items="sortedUsers"
            item-value="userId"
            :items-per-page="-1"
            :mobile="xs"
            hide-default-footer
        >
            <template #[`item.name`]="{ item }">
                <span class="user-table__name">
                    <UserAvatar :first-name="item.firstName" :last-name="item.lastName" />
                    <span class="user-table__who">
                        <RouterLink
                            :to="{ name: RouteNames.USER_DETAILS, params: { userId: item.userId } }"
                            class="user-table__link"
                        >
                            {{ item.firstName }} {{ item.lastName }}
                        </RouterLink>
                        <TagLabel v-if="item.userId === currentUser?.userId" :label="t('module.users.list.you')" />
                        <span class="user-table__email">{{ item.email }}</span>
                    </span>
                </span>
            </template>
            <template #[`item.role`]="{ item }">
                <TagLabel :label="roleLabel(item.role)" />
            </template>
            <template #[`item.projects`]="{ item }">
                <span class="tabular-nums">
                    {{
                        item.role.type === 'super_admin' ? t('module.users.list.allProjects') : n(item.membershipCount)
                    }}
                </span>
            </template>
            <template #[`item.actions`]="{ item }">
                <VMenu v-if="item.userId !== currentUser?.userId && (canUpdateUser(item) || canDeleteUser(item))">
                    <template #activator="{ props: activator }">
                        <IconButton
                            v-bind="activator"
                            :icon="mdiDotsVertical"
                            :label="t('module.users.list.actions', { name: `${item.firstName} ${item.lastName}` })"
                            small
                        />
                    </template>
                    <VList density="compact">
                        <VListItem
                            :to="{ name: RouteNames.USER_DETAILS, params: { userId: item.userId } }"
                            :prepend-icon="mdiPencilOutline"
                            :title="t('module.users.list.edit')"
                        />
                        <VListItem
                            v-if="canDeleteUser(item)"
                            class="text-error"
                            :prepend-icon="mdiDeleteOutline"
                            :title="t('module.users.list.delete')"
                            @click="deleteUser(item, item.membershipCount, false)"
                        />
                    </VList>
                </VMenu>
            </template>
        </VDataTable>
    </VCard>

    <AddUserDialog v-if="canCreate" v-model="createOpen" />
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useDisplay } from 'vuetify'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import { mdiDeleteOutline, mdiDotsVertical, mdiPencilOutline, mdiPlus } from '@mdi/js'
    import type { UserListDto } from 'api'
    import ErrorState from '@/components/ErrorState.vue'
    import IconButton from '@/components/IconButton.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import TagLabel from '@/components/TagLabel.vue'
    import UserAvatar from '@/components/UserAvatar.vue'
    import TableSkeleton from '@/components/skeletons/TableSkeleton.vue'
    import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
    import { useDeleteUser } from '@/modules/users/composables/useDeleteUser.ts'
    import { useRoleLabels } from '@/modules/users/composables/useRoleLabel.ts'
    import { useUsersQuery } from '@/modules/users/queries/useUsersQuery.ts'
    import AddUserDialog from '@/modules/users/views/list/partials/AddUserDialog.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const ROLE_ORDER = ['super_admin', 'admin', 'user', 'custom']

    const { t, n } = useI18n()
    const { xs } = useDisplay()
    const userAbility = useAbility()
    const roleLabel = useRoleLabels()
    const deleteUser = useDeleteUser()
    const { data: users, isPending, isError, error, isFetching, refetch } = useQuery(useUsersQuery())
    const { data: currentUser } = useQuery(useAuthQuery())
    const createOpen = ref(false)

    const canCreate = computed(() => userAbility.can('create', 'User'))

    const headers = computed(() => [
        { key: 'name', title: t('module.users.list.columns.name'), sortable: false },
        { key: 'role', title: t('module.users.list.columns.role'), sortable: false },
        { key: 'projects', title: t('module.users.list.columns.projects'), sortable: false, align: 'end' as const },
        { key: 'actions', title: t('module.users.list.columns.actions'), sortable: false, align: 'end' as const },
    ])

    const sortedUsers = computed(() =>
        [...(users.value ?? [])].sort(
            (a, b) =>
                ROLE_ORDER.indexOf(a.role.type) - ROLE_ORDER.indexOf(b.role.type) ||
                `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
        ),
    )

    function canUpdateUser(user: UserListDto) {
        return userAbility.can('update', subject('User', { ...user }))
    }

    function canDeleteUser(user: UserListDto) {
        return userAbility.can('delete', subject('User', { ...user }))
    }
</script>

<style scoped>
    .user-table {
        background: rgb(var(--v-theme-surface));
    }

    .user-table__name {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 0;
    }

    .user-table__who {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 2px 8px;
        min-width: 0;
    }

    .user-table__link {
        color: rgb(var(--v-theme-ink));
        font-weight: 500;
        text-decoration: none;
    }

    .user-table__link:hover {
        text-decoration: underline;
    }

    .user-table__email {
        flex-basis: 100%;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
    }
</style>
