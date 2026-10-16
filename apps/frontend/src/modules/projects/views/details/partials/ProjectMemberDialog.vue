<template>
    <FormDialog
        v-model="model"
        width="lg"
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
        <fieldset class="member-access">
            <legend>{{ t('module.projects.members.dialog.access', { project: project.name }) }}</legend>
            <VSelect
                v-model="selectedRoleId"
                name="roleId"
                data-testid="roleId"
                :label="requiredLabel(t('module.projects.members.dialog.role'))"
                :items="roleOptions"
                item-title="name"
                item-value="roleId"
                :loading="rolesLoading"
                :hint="selectedRole?.description ?? undefined"
                persistent-hint
                :error-messages="roleError"
                aria-required="true"
            >
                <template #item="{ props: itemProps, item }">
                    <VListItem v-bind="itemProps" :subtitle="item.description ?? undefined" />
                </template>
            </VSelect>
            <DisclosureBox :summary="t('module.projects.members.dialog.advanced')">
                <p class="member-access__hint">{{ t('module.projects.members.dialog.advancedHint') }}</p>
                <PermissionGrid
                    v-model="extraPermissions"
                    scope="project"
                    :groups="PROJECT_PERMISSION_GROUPS"
                    :locked="rolePermissions"
                    :locked-hint="t('module.projects.members.dialog.fromRole', { role: selectedRole?.name ?? '' })"
                    :grantable="grantablePermissions"
                />
            </DisclosureBox>
        </fieldset>
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import type { ProjectDetailDto, ProjectMemberDto, ProjectPermission, ProjectRoleDto } from 'api'
    import DisclosureBox from '@/components/DisclosureBox.vue'
    import FormDialog from '@/components/FormDialog.vue'
    import ReadonlyValue from '@/components/ReadonlyValue.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import PermissionGrid from '@/modules/roles/components/PermissionGrid.vue'
    import { PROJECT_PERMISSION_GROUPS } from '@/modules/roles/permissionCatalog.ts'
    import { useUsersQuery } from '@/modules/users/queries/useUsersQuery.ts'
    import { useRoleLabels } from '@/modules/users/composables/useRoleLabel.ts'
    import { useProjectMemberSetMutation } from '@/modules/projects/mutations/useProjectMemberSetMutation.ts'
    import { useProjectRolesQuery } from '@/modules/projects/queries/useProjectRolesQuery.ts'
    import { PROJECT_PERMISSIONS } from '@/modules/projects/helpers/projectPermissions.ts'

    const props = defineProps<{ project: ProjectDetailDto; member?: ProjectMemberDto; existing: ProjectMemberDto[] }>()
    const model = defineModel<boolean>({ required: true })

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const roleLabel = useRoleLabels()
    const userAbility = useAbility()
    const errorMessage = ref<string | null>(null)
    const userError = ref<string | undefined>()
    const roleError = ref<string | undefined>()
    const selectedUserId = ref<number | null>(null)
    const selectedRoleId = ref<number | null>(null)
    const extraPermissions = ref<ProjectPermission[]>([])
    const { mutateAsync, isPending } = useProjectMemberSetMutation()

    const { queryKey, queryFn } = useUsersQuery()
    const { data: users, isLoading } = useQuery({
        queryKey,
        queryFn,
        enabled: computed(() => model.value && !props.member),
    })
    const rolesQuery = useProjectRolesQuery(() => props.project.projectId)
    const { data: roles, isLoading: rolesLoading } = useQuery({ ...rolesQuery, enabled: model })

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

    function heldOnProject(permission: ProjectPermission) {
        return userAbility.can(permission, subject('Project', { projectId: props.project.projectId }))
    }

    const grantablePermissions = computed(() => PROJECT_PERMISSIONS.filter(heldOnProject))

    const grantableRoles = computed(() =>
        (roles.value ?? []).filter(
            (role) => role.permissions.every(heldOnProject) || role.roleId === props.member?.role.roleId,
        ),
    )

    const roleOptions = computed(() =>
        grantableRoles.value.map((role) => ({ roleId: role.roleId, name: role.name, description: role.description })),
    )

    const selectedRole = computed<ProjectRoleDto | undefined>(() =>
        roles.value?.find((role) => role.roleId === selectedRoleId.value),
    )
    const rolePermissions = computed(() => selectedRole.value?.permissions ?? [])

    function defaultRoleId() {
        if (props.member) {
            return props.member.role.roleId
        }
        const smallest = [...grantableRoles.value].sort(
            (a, b) => a.permissions.length - b.permissions.length || a.name.localeCompare(b.name),
        )[0]
        return smallest?.roleId ?? null
    }

    const initialExtras = computed(() => (props.member ? [...props.member.permissions] : []))
    const dirty = computed(
        () =>
            selectedUserId.value !== null ||
            selectedRoleId.value !== (props.member?.role.roleId ?? defaultRoleId()) ||
            [...extraPermissions.value].sort().join() !== [...initialExtras.value].sort().join(),
    )

    watch(rolePermissions, (permissions) => {
        extraPermissions.value = extraPermissions.value.filter((permission) => !permissions.includes(permission))
    })

    watch(
        model,
        (open) => {
            if (open) {
                errorMessage.value = null
                userError.value = undefined
                roleError.value = undefined
                selectedUserId.value = null
                selectedRoleId.value = defaultRoleId()
                extraPermissions.value = initialExtras.value
            }
        },
        { immediate: true },
    )

    watch(roles, () => {
        if (model.value && selectedRoleId.value === null) {
            selectedRoleId.value = defaultRoleId()
        }
    })

    async function onSubmit() {
        errorMessage.value = null
        userError.value = undefined
        roleError.value = undefined
        const userId = props.member?.userId ?? selectedUserId.value
        if (userId === null) {
            userError.value = t('module.projects.members.dialog.userRequired')
        }
        if (selectedRoleId.value === null) {
            roleError.value = t('module.projects.members.dialog.roleRequired')
        }
        if (userId === null || selectedRoleId.value === null) {
            return
        }
        const name = props.member ? memberName.value : userOptions.value.find((user) => user.userId === userId)?.name
        try {
            await mutateAsync({
                projectId: props.project.projectId,
                userId,
                roleId: selectedRoleId.value,
                permissions: extraPermissions.value,
            })
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
    .member-access {
        display: grid;
        gap: 16px;
        margin: 0;
        padding: 0;
        border: 0;
    }

    .member-access legend {
        margin-bottom: 4px;
        font-size: 0.875rem;
        font-weight: 600;
        line-height: 1.25rem;
    }

    .member-access__hint {
        margin: 0 0 12px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.8125rem;
        line-height: 1.25rem;
    }
</style>
