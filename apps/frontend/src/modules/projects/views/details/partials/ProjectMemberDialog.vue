<template>
    <FormDialog
        v-model="model"
        :title="
            member
                ? t('module.projects.members.dialog.editTitle', { name: memberName })
                : t('module.projects.members.dialog.addTitle')
        "
        :submit-label="member ? t('cta.save') : t('module.projects.members.dialog.submit')"
        :pending="isPending"
        :error="errorMessage"
        :dirty="dirty"
        @submit="onSubmit"
    >
        <ReadonlyValue v-if="member" :label="t('field.user')" :value="`${memberName} · ${member.email}`" />
        <VAutocomplete
            v-else
            v-model="selectedUserId"
            name="userId"
            :label="requiredLabel(t('field.user'))"
            :items="userOptions"
            item-title="name"
            item-value="userId"
            :loading="isLoading"
            :error-messages="userError"
            :hint="selectedHint"
            persistent-hint
            aria-required="true"
        >
            <template #item="{ props: itemProps, item }">
                <VListItem v-bind="itemProps" :subtitle="item.hint" />
            </template>
        </VAutocomplete>
        <fieldset class="member-permissions">
            <legend>{{ t('module.projects.members.dialog.access', { project: project.name }) }}</legend>
            <VCheckbox
                v-for="permission in PROJECT_PERMISSIONS"
                :key="permission"
                v-model="selectedPermissions"
                :value="permission"
                :label="t(`permissions.project.${permission}`)"
                :messages="t(`module.projects.members.dialog.explain.${permission}`)"
                hide-details="auto"
            />
            <p v-if="permissionError" class="member-permissions__error" role="alert">{{ permissionError }}</p>
        </fieldset>
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import type { ProjectDetailDto, ProjectMemberDto, ProjectPermission } from 'api'
    import FormDialog from '@/components/FormDialog.vue'
    import ReadonlyValue from '@/components/ReadonlyValue.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useUsersQuery } from '@/modules/users/queries/useUsersQuery.ts'
    import { useRoleLabels } from '@/modules/users/composables/useRoleLabel.ts'
    import { useProjectMemberSetMutation } from '@/modules/projects/mutations/useProjectMemberSetMutation.ts'
    import { PROJECT_PERMISSIONS } from '@/modules/projects/helpers/projectPermissions.ts'

    const props = defineProps<{ project: ProjectDetailDto; member?: ProjectMemberDto; existing: ProjectMemberDto[] }>()
    const model = defineModel<boolean>({ required: true })

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const roleLabel = useRoleLabels()
    const errorMessage = ref<string | null>(null)
    const userError = ref<string | undefined>()
    const permissionError = ref<string | undefined>()
    const selectedUserId = ref<number | null>(null)
    const selectedPermissions = ref<ProjectPermission[]>(['read'])
    const { mutateAsync, isPending } = useProjectMemberSetMutation()

    const { queryKey, queryFn } = useUsersQuery()
    const { data: users, isLoading } = useQuery({
        queryKey,
        queryFn,
        enabled: computed(() => model.value && !props.member),
    })

    const memberName = computed(() => (props.member ? `${props.member.firstName} ${props.member.lastName}` : ''))

    const userOptions = computed(() =>
        (users.value ?? [])
            .filter((user) => !props.existing.some((member) => member.userId === user.userId))
            .map((user) => ({
                userId: user.userId,
                name: `${user.firstName} ${user.lastName}`,
                hint: t('module.projects.members.dialog.userHint', { email: user.email, role: roleLabel(user.role) }),
            })),
    )

    const selectedHint = computed(() => userOptions.value.find((user) => user.userId === selectedUserId.value)?.hint)

    const initialPermissions = computed(() => (props.member ? [...props.member.permissions] : ['read']))
    const dirty = computed(
        () =>
            selectedUserId.value !== null ||
            [...selectedPermissions.value].sort().join() !== [...initialPermissions.value].sort().join(),
    )

    watch(
        model,
        (open) => {
            if (open) {
                errorMessage.value = null
                userError.value = undefined
                permissionError.value = undefined
                selectedUserId.value = null
                selectedPermissions.value = props.member ? [...props.member.permissions] : ['read']
            }
        },
        { immediate: true },
    )

    async function onSubmit() {
        errorMessage.value = null
        userError.value = undefined
        permissionError.value = undefined
        const userId = props.member?.userId ?? selectedUserId.value
        if (userId === null) {
            userError.value = t('module.projects.members.dialog.userRequired')
        }
        if (selectedPermissions.value.length === 0) {
            permissionError.value = t('module.projects.members.dialog.permissionRequired')
        }
        if (userId === null || selectedPermissions.value.length === 0) {
            return
        }
        const name = props.member ? memberName.value : userOptions.value.find((user) => user.userId === userId)?.name
        try {
            await mutateAsync({ projectId: props.project.projectId, userId, permissions: selectedPermissions.value })
            model.value = false
            notify.success(
                props.member
                    ? t('module.projects.members.updated', { name })
                    : t('module.projects.members.added', { name }),
            )
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.members.error'))
        }
    }
</script>

<style scoped>
    .member-permissions {
        display: grid;
        gap: 8px;
        margin: 0;
        padding: 0;
        border: 0;
    }

    .member-permissions legend {
        margin-bottom: 4px;
        font-size: 0.875rem;
        font-weight: 600;
        line-height: 1.25rem;
    }

    .member-permissions__error {
        color: rgb(var(--v-theme-error));
        font-size: 0.75rem;
        line-height: 1rem;
    }
</style>
