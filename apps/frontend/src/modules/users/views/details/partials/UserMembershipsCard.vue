<template>
    <VCard :title="t('module.users.details.memberships.title')">
        <VCardItem>
            <p v-if="user.memberships.length === 0">{{ t('module.users.details.memberships.empty') }}</p>
            <VList v-else>
                <VListItem
                    v-for="membership in user.memberships"
                    :key="membership.projectId"
                    :title="membership.projectName"
                    :to="{ name: RouteNames.PROJECT_DETAILS, params: { projectId: membership.projectId } }"
                >
                    <template #append>
                        <VChip
                            v-for="permission in membership.permissions"
                            :key="permission"
                            size="small"
                            class="ms-1"
                            :text="t(`permissions.project.${permission}`)"
                        />
                    </template>
                </VListItem>
            </VList>
        </VCardItem>
    </VCard>
</template>

<script setup lang="ts">
    import { useI18n } from 'vue-i18n'
    import type { UserDetailDto } from 'api'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    defineProps<{ user: UserDetailDto }>()
</script>
