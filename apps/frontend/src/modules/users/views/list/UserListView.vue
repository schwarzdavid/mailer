<template>
    <VContainer>
        <div class="d-flex justify-space-between align-center">
            <h1>{{ t('module.users.list.title') }}</h1>
            <AddUserDialog v-if="can('create', 'User')" v-slot="{ props }">
                <VBtn v-bind="props">{{ t('cta.add') }}</VBtn>
            </AddUserDialog>
        </div>
        <VDivider />
        <VFadeTransition leave-absolute>
            <div class="d-flex flex-column gr-3 pt-6" v-if="isPending">
                <VSkeletonLoader v-for="i in 3" :key="i" type="table-heading" />
            </div>
            <div class="d-flex flex-column gr-3 pt-6" v-else>
                <UserListEntry v-for="user in users" :key="user.userId" :user="user" />
            </div>
        </VFadeTransition>
    </VContainer>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { useUsersQuery } from '@/modules/users/queries/useUsersQuery.ts'
    import AddUserDialog from '@/modules/users/views/list/partials/AddUserDialog.vue'
    import UserListEntry from '@/modules/users/views/list/partials/UserListEntry.vue'

    const { t } = useI18n()
    const userAbility = useAbility()
    const can = userAbility.can.bind(userAbility)
    const { data: users, isPending } = useQuery(useUsersQuery())
</script>
