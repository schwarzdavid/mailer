<template>
    <SectionCard
        :title="t('module.projects.members.title')"
        :description="t('module.projects.members.description')"
        :count="visibleMembers?.length"
        :refetching="isFetching && !isPending"
        flush
    >
        <template v-if="canPickUsers" #actions>
            <VBtn size="small" :prepend-icon="mdiPlus" :text="t('module.projects.members.add')" @click="openDialog()" />
        </template>
        <ListSkeleton v-if="isPending" :rows="2" />
        <ErrorState v-else-if="isError" :thing="t('module.projects.members.thing')" :error="error" @retry="refetch()" />
        <EmptyState
            v-else-if="visibleMembers.length === 0"
            :icon="mdiAccountMultipleOutline"
            :title="t('module.projects.members.empty.title')"
            :text="t('module.projects.members.empty.text')"
        />
        <ListRow v-for="member in visibleMembers" v-else :key="member.userId" :subtitle="member.email" lead-tone="none">
            <template #lead>
                <UserAvatar :first-name="member.firstName" :last-name="member.lastName" />
            </template>
            <template #title>
                <RouterLink
                    v-if="canReadUsers"
                    :to="{ name: RouteNames.USER_DETAILS, params: { userId: member.userId } }"
                    class="row-link"
                >
                    {{ member.firstName }} {{ member.lastName }}
                </RouterLink>
                <span v-else>{{ member.firstName }} {{ member.lastName }}</span>
            </template>
            <template #meta>
                <TagLabel
                    v-for="permission in sortedPermissions(member.permissions)"
                    :key="permission"
                    :label="t(`permissions.project.${permission}`)"
                />
            </template>
            <template #actions>
                <IconButton
                    :icon="mdiPencilOutline"
                    :label="t('module.projects.members.editLabel', { name: fullName(member) })"
                    @click="openDialog(member)"
                />
                <IconButton
                    :icon="mdiDeleteOutline"
                    :label="t('module.projects.members.removeLabel', { name: fullName(member) })"
                    danger
                    @click="removeMember(member)"
                />
            </template>
        </ListRow>
        <template v-if="implicitAccessNote" #note>
            <VIcon :icon="mdiInformationOutline" size="16" aria-hidden="true" />
            <span>
                {{ implicitAccessNote }}
                <RouterLink v-if="canReadUsers" :to="{ name: RouteNames.USER_LIST }" class="row-link">
                    {{ t('module.projects.members.manageInUsers') }}
                </RouterLink>
            </span>
        </template>
    </SectionCard>
    <ProjectMemberDialog v-model="dialogOpen" :project="project" :member="editedMember" :existing="members ?? []" />
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import {
        mdiAccountMultipleOutline,
        mdiDeleteOutline,
        mdiInformationOutline,
        mdiPencilOutline,
        mdiPlus,
    } from '@mdi/js'
    import type { ProjectDetailDto, ProjectMemberDto } from 'api'
    import EmptyState from '@/components/EmptyState.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import IconButton from '@/components/IconButton.vue'
    import ListRow from '@/components/ListRow.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import TagLabel from '@/components/TagLabel.vue'
    import UserAvatar from '@/components/UserAvatar.vue'
    import ListSkeleton from '@/components/skeletons/ListSkeleton.vue'
    import { useUndoRemove } from '@/composables/useUndoRemove.ts'
    import { useProjectMembersQuery } from '@/modules/projects/queries/useProjectMembersQuery.ts'
    import { useProjectImplicitAccessQuery } from '@/modules/projects/queries/useProjectImplicitAccessQuery.ts'
    import { useProjectMemberRemoveMutation } from '@/modules/projects/mutations/useProjectMemberRemoveMutation.ts'
    import ProjectMemberDialog from '@/modules/projects/views/details/partials/ProjectMemberDialog.vue'
    import { sortedPermissions } from '@/modules/projects/helpers/projectPermissions.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ project: ProjectDetailDto }>()

    const { t } = useI18n()
    const userAbility = useAbility()
    const canReadUsers = computed(() => userAbility.can('read', 'User'))
    const canPickUsers = canReadUsers

    const {
        data: members,
        isPending,
        isFetching,
        isError,
        error,
        refetch,
    } = useQuery(useProjectMembersQuery(() => props.project.projectId))
    const { data: implicitAccess } = useQuery(useProjectImplicitAccessQuery(() => props.project.projectId))
    const { mutateAsync: removeMemberRequest } = useProjectMemberRemoveMutation()
    const { remove, isHidden } = useUndoRemove<number>()

    const dialogOpen = ref(false)
    const editedMember = ref<ProjectMemberDto | undefined>()

    const visibleMembers = computed(() => (members.value ?? []).filter((member) => !isHidden(member.userId)))

    const implicitAccessNote = computed(() => {
        const access = implicitAccess.value
        if (!access) {
            return undefined
        }
        const parts: string[] = []
        if (access.superAdminCount > 0) {
            parts.push(
                t(
                    'module.projects.members.implicit.superAdmins',
                    { count: access.superAdminCount },
                    access.superAdminCount,
                ),
            )
        }
        if (access.allProjectsUserCount > 0) {
            parts.push(
                t(
                    'module.projects.members.implicit.allProjects',
                    { count: access.allProjectsUserCount },
                    access.allProjectsUserCount,
                ),
            )
        }
        if (parts.length === 0) {
            return undefined
        }
        return t('module.projects.members.implicit.note', {
            who: parts.join(t('module.projects.members.implicit.and')),
        })
    })

    function fullName(member: ProjectMemberDto) {
        return `${member.firstName} ${member.lastName}`
    }

    function openDialog(member?: ProjectMemberDto) {
        editedMember.value = member
        dialogOpen.value = true
    }

    function removeMember(member: ProjectMemberDto) {
        remove(member.userId, {
            text: t('module.projects.members.removed', { name: fullName(member) }),
            errorText: t('module.projects.members.removeError', { name: fullName(member) }),
            commit: () => removeMemberRequest({ projectId: props.project.projectId, userId: member.userId }),
        })
    }
</script>
