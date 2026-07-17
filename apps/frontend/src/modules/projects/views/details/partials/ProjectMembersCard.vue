<template>
    <VCard v-if="canManage" :title="t('module.projects.members.title')">
        <VCardItem>
            <p v-if="members?.length === 0">{{ t('module.projects.members.empty') }}</p>
            <VList v-else>
                <VListItem
                    v-for="member in members"
                    :key="member.userId"
                    :title="`${member.firstName} ${member.lastName}`"
                    :subtitle="member.email"
                >
                    <template #append>
                        <VChip
                            v-for="permission in member.permissions"
                            :key="permission"
                            size="small"
                            class="ms-1"
                            :text="t(`permissions.project.${permission}`)"
                        />
                        <ProjectMemberDialog :project-id="projectId" :member="member" v-slot="{ props: dialogProps }">
                            <VIconBtn icon="mdi-pencil" class="ms-2" v-bind="dialogProps" />
                        </ProjectMemberDialog>
                        <VIconBtn
                            icon="mdi-delete"
                            class="ms-1"
                            :loading="isPending"
                            @click="onRemove(member.userId)"
                        />
                    </template>
                </VListItem>
            </VList>
        </VCardItem>
        <VCardActions v-if="canPickUsers">
            <VSpacer />
            <ProjectMemberDialog :project-id="projectId" v-slot="{ props: dialogProps }">
                <VBtn color="primary" v-bind="dialogProps" :text="t('module.projects.members.add')" />
            </ProjectMemberDialog>
        </VCardActions>
    </VCard>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import { useProjectMembersQuery } from '@/modules/projects/queries/useProjectMembersQuery.ts'
    import { useProjectMemberRemoveMutation } from '@/modules/projects/mutations/useProjectMemberRemoveMutation.ts'
    import ProjectMemberDialog from '@/modules/projects/views/details/partials/ProjectMemberDialog.vue'

    const props = defineProps<{ projectId: number }>()
    const { t } = useI18n()
    const userAbility = useAbility()
    const can = userAbility.can.bind(userAbility)

    const canManage = computed(
        () => can('update', 'User') || can('update', subject('Project', { projectId: props.projectId })),
    )
    const canPickUsers = computed(() => can('read', 'User'))

    const { data: members } = useQuery({
        ...useProjectMembersQuery(() => props.projectId),
        enabled: canManage,
    })
    const { mutate: removeMember, isPending } = useProjectMemberRemoveMutation()

    function onRemove(userId: number) {
        removeMember({ projectId: props.projectId, userId })
    }
</script>
