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
            <div v-else class="d-flex flex-column align-start gr-4">
                <VAlert type="error" :text="apiErrorMessage(error, t('module.users.details.loadError'))" />
                <VBtn prepend-icon="mdi-arrow-left" :text="t('cta.back')" @click="backToList" />
            </div>
        </VFadeTransition>
    </VContainer>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useRoute, useRouter } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import { useUserQuery } from '@/modules/users/queries/useUserQuery.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { RouteNames } from '@/router/RouteNames.ts'
    import UserProfileCard from '@/modules/users/views/details/partials/UserProfileCard.vue'
    import UserPermissionsCard from '@/modules/users/views/details/partials/UserPermissionsCard.vue'
    import UserMembershipsCard from '@/modules/users/views/details/partials/UserMembershipsCard.vue'

    const { t } = useI18n()
    const route = useRoute()
    const router = useRouter()
    const { data: user, isPending, error } = useQuery(useUserQuery(() => Number(route.params.userId)))

    function backToList() {
        void router.push({ name: RouteNames.USER_LIST })
    }
</script>
