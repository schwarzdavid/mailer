<template>
    <SectionCard
        :title="t('module.users.details.memberships.title')"
        :description="t('module.users.details.memberships.description')"
        :count="user.memberships.length"
        flush
    >
        <EmptyState
            v-if="user.memberships.length === 0"
            :icon="mdiFolderOutline"
            :title="t('module.users.details.memberships.empty.title')"
            :text="t('module.users.details.memberships.empty.text')"
        />
        <ListRow
            v-for="membership in user.memberships"
            :key="membership.projectId"
            :icon="mdiFolderOutline"
            :title="membership.projectName"
            :to="{ name: RouteNames.PROJECT_DETAILS, params: { projectId: membership.projectId } }"
        >
            <template #meta>
                <TagLabel
                    v-for="permission in sortedPermissions(membership.permissions)"
                    :key="permission"
                    :label="t(`permissions.project.${permission}`)"
                />
            </template>
        </ListRow>
    </SectionCard>
</template>

<script setup lang="ts">
    import { useI18n } from 'vue-i18n'
    import { mdiFolderOutline } from '@mdi/js'
    import type { UserDetailDto } from 'api'
    import EmptyState from '@/components/EmptyState.vue'
    import ListRow from '@/components/ListRow.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import TagLabel from '@/components/TagLabel.vue'
    import { sortedPermissions } from '@/modules/projects/helpers/projectPermissions.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    defineProps<{ user: UserDetailDto }>()

    const { t } = useI18n()
</script>
