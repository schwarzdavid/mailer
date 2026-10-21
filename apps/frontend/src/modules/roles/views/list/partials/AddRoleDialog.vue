<template>
    <FormDialog
        v-model="model"
        :title="t('module.roles.add.title')"
        :submit-label="t('module.roles.add.submit')"
        :pending="isPending"
        :error="errorMessage"
        :dirty="changed"
        @submit="onSubmit"
    >
        <VTextField
            v-model="name"
            name="name"
            :label="requiredLabel(t('field.name'))"
            :error-messages="errors.name"
            aria-required="true"
        />
        <VSelect
            v-model="scope"
            name="scope"
            data-testid="scope"
            :label="requiredLabel(t('module.roles.add.scope'))"
            :items="scopeOptions"
            item-title="title"
            item-value="value"
            :hint="t(`module.roles.add.scopeHint.${scope}`)"
            persistent-hint
            :error-messages="errors.scope"
        />
        <VTextField
            v-model="description"
            name="description"
            :label="t('module.roles.add.description')"
            :error-messages="errors.description"
        />
        <VSelect
            v-model="startFrom"
            name="startFrom"
            data-testid="startFrom"
            :label="t('module.roles.add.startFrom')"
            :items="templateOptions"
            item-title="name"
            item-value="roleId"
            :hint="t('module.roles.add.startFromHint')"
            persistent-hint
            clearable
        />
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { useQuery } from '@tanstack/vue-query'
    import { useRouter } from 'vue-router'
    import type { CatalogPermission, RoleScope } from 'api'
    import FormDialog from '@/components/FormDialog.vue'
    import { useFormChanged } from '@/composables/useDirtyGuard.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useAuthPermissionsQuery } from '@/modules/auth/queries/useAuthPermissionsQuery.ts'
    import { useRoleCreateMutation } from '@/modules/roles/mutations/useRoleCreateMutation.ts'
    import { useRolesQuery } from '@/modules/roles/queries/useRolesQuery.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const SCOPES: RoleScope[] = ['global', 'project']
    const FRESH_PERMISSIONS: Record<RoleScope, CatalogPermission[]> = { global: [], project: ['read'] }

    const model = defineModel<boolean>({ required: true })
    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const router = useRouter()
    const errorMessage = ref<string | null>(null)
    const { mutateAsync, isPending } = useRoleCreateMutation()
    const { data: roles } = useQuery(useRolesQuery())
    const { data: held } = useQuery(useAuthPermissionsQuery())

    const { defineField, handleSubmit, errors, resetForm, meta, values } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z.string().trim().min(1).max(100),
                scope: z.enum(['global', 'project']),
                description: z.string().trim().max(255).optional().or(z.literal('')),
                startFrom: z.number().nullable().optional(),
            }),
        ),
        initialValues: { scope: 'global', description: '', startFrom: null },
    })

    const [name] = defineField('name')
    const [scope] = defineField('scope')
    const [description] = defineField('description')
    const [startFrom] = defineField('startFrom')

    const changed = useFormChanged(values, () => meta.value.initialValues)

    const scopeOptions = computed(() => SCOPES.map((value) => ({ value, title: t(`module.roles.scope.${value}`) })))
    const heldPermissions = computed<Record<RoleScope, Set<string>>>(() => ({
        global: new Set<string>(held.value?.permissions ?? []),
        project: new Set<string>(held.value?.projectPermissions ?? []),
    }))
    const templateOptions = computed(() =>
        (roles.value ?? []).filter(
            (role) =>
                role.scope === scope.value &&
                role.type !== 'super_admin' &&
                role.permissions.every((permission) => heldPermissions.value[role.scope].has(permission)),
        ),
    )

    watch(scope, () => {
        startFrom.value = null
    })

    watch(
        model,
        (open) => {
            if (open) {
                errorMessage.value = null
                resetForm({ values: { name: '', scope: 'global', description: '', startFrom: null } })
            }
        },
        { immediate: true },
    )

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        const template = roles.value?.find((role) => role.roleId === values.startFrom)
        try {
            const { roleId } = await mutateAsync({
                name: values.name,
                scope: values.scope,
                description: values.description ? values.description : null,
                permissions: template?.permissions ?? FRESH_PERMISSIONS[values.scope],
            })
            model.value = false
            await router.push({ name: RouteNames.ROLE_DETAILS, params: { roleId } })
            notify.success(t('module.roles.add.success'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.roles.add.error'))
        }
    })
</script>
