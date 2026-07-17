<template>
    <VDialog max-width="500" v-model="model" :persistent="isPending" @after-leave="onAfterLeave">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="member ? t('module.projects.members.edit') : t('module.projects.members.add')">
            <VCardItem>
                <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
                <VSelect
                    v-if="!member"
                    :label="t('field.user')"
                    :items="userOptions"
                    item-title="name"
                    item-value="userId"
                    v-model="selectedUserId"
                />
                <VCheckbox
                    v-for="level in PROJECT_LEVELS"
                    :key="level"
                    v-model="selectedPermissions"
                    :value="level"
                    :label="t(`permissions.project.${level}`)"
                    density="compact"
                    hide-details
                />
            </VCardItem>
            <VCardActions>
                <VSpacer />
                <VBtn :text="t('cta.abort')" :disabled="isPending" @click="model = false" />
                <VBtn
                    color="primary"
                    variant="elevated"
                    :text="t('cta.save')"
                    :loading="isPending"
                    :disabled="targetUserId === undefined || selectedPermissions.length === 0"
                    @click="onSave"
                />
            </VCardActions>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import type { ProjectMemberDto, ProjectPermission } from 'api'
    import { useUsersQuery } from '@/modules/users/queries/useUsersQuery.ts'
    import { useProjectMemberSetMutation } from '@/modules/projects/mutations/useProjectMemberSetMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const PROJECT_LEVELS: ProjectPermission[] = ['read', 'update', 'delete']

    const props = defineProps<{ projectId: number; member?: ProjectMemberDto }>()
    const { t } = useI18n()
    const userAbility = useAbility()
    const can = userAbility.can.bind(userAbility)
    const model = ref<undefined | boolean>()
    const errorMessage = ref<string | null>(null)
    const selectedUserId = ref<number | undefined>()
    const selectedPermissions = ref<ProjectPermission[]>(props.member ? [...props.member.permissions] : ['read'])
    const { mutateAsync, isPending } = useProjectMemberSetMutation()

    const usersQueryOptions = useUsersQuery()
    const { data: users } = useQuery({
        queryKey: usersQueryOptions.queryKey,
        queryFn: usersQueryOptions.queryFn,
        enabled: computed(() => !props.member && can('read', 'User')),
    })

    const userOptions = computed(() =>
        (users.value ?? []).map((user) => ({ userId: user.userId, name: `${user.firstName} ${user.lastName}` })),
    )
    const targetUserId = computed(() => props.member?.userId ?? selectedUserId.value)

    async function onSave() {
        if (targetUserId.value === undefined) {
            return
        }
        errorMessage.value = null
        try {
            await mutateAsync({
                projectId: props.projectId,
                userId: targetUserId.value,
                permissions: selectedPermissions.value,
            })
            model.value = false
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.members.error'))
        }
    }

    function onAfterLeave() {
        errorMessage.value = null
        selectedUserId.value = undefined
        selectedPermissions.value = props.member ? [...props.member.permissions] : ['read']
    }
</script>
