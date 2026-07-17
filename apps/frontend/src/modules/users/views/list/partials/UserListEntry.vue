<template>
    <VCard :to="{ name: RouteNames.USER_DETAILS, params: { userId: user.userId } }">
        <VCardItem>
            <VCardTitle>{{ user.firstName }} {{ user.lastName }}</VCardTitle>
            <VCardSubtitle>{{ user.email }}</VCardSubtitle>
            <template #append>
                <VChip size="small" :text="user.role.name" class="me-2" />
                <DeleteUserDialog v-if="canDelete" :user="user" v-slot="{ props }">
                    <VIconBtn icon="mdi-delete" v-bind="props" @click.prevent />
                </DeleteUserDialog>
            </template>
        </VCardItem>
    </VCard>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import type { UserDto } from 'api'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import { useQuery } from '@tanstack/vue-query'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
    import DeleteUserDialog from '@/modules/users/views/list/partials/DeleteUserDialog.vue'

    const props = defineProps<{ user: UserDto }>()
    const userAbility = useAbility()
    const can = userAbility.can.bind(userAbility)
    const { data: currentUser } = useQuery(useAuthQuery())

    const canDelete = computed(
        () => can('delete', subject('User', { ...props.user })) && props.user.userId !== currentUser.value?.userId,
    )
</script>
