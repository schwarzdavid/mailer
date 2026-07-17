<template>
    <VContainer>
        <VFadeTransition leave-absolute>
            <div v-if="isPending">
                <VSkeletonLoader type="card" />
            </div>
            <div v-else-if="user" class="d-flex flex-column gr-6">
                <div class="d-flex justify-space-between align-center">
                    <h1>{{ user.firstName }} {{ user.lastName }}</h1>
                    <VChip :text="user.role.name" />
                </div>
                <VDivider />
                <UserProfileCard :user="user" />
                <UserPermissionsCard :user="user" />
                <UserMembershipsCard :user="user" />
            </div>
        </VFadeTransition>
    </VContainer>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useRoute } from 'vue-router'
    import { useUserQuery } from '@/modules/users/queries/useUserQuery.ts'
    import UserProfileCard from '@/modules/users/views/details/partials/UserProfileCard.vue'
    import UserPermissionsCard from '@/modules/users/views/details/partials/UserPermissionsCard.vue'
    import UserMembershipsCard from '@/modules/users/views/details/partials/UserMembershipsCard.vue'

    const route = useRoute()
    const { data: user, isPending } = useQuery(useUserQuery(() => Number(route.params.userId)))
</script>
