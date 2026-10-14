<template>
    <FormDialog
        v-model="model"
        width="lg"
        :title="t('module.users.add.title')"
        :submit-label="t('module.users.add.submit')"
        :pending="isPending"
        :error="errorMessage"
        :dirty="meta.dirty"
        @submit="onSubmit"
    >
        <div class="form-grid form-grid--2">
            <VTextField
                v-model="firstName"
                name="firstName"
                :label="requiredLabel(t('field.firstName'))"
                :error-messages="errors.firstName"
                aria-required="true"
            />
            <VTextField
                v-model="lastName"
                name="lastName"
                :label="requiredLabel(t('field.lastName'))"
                :error-messages="errors.lastName"
                aria-required="true"
            />
            <VTextField
                v-model="email"
                name="email"
                type="email"
                :label="requiredLabel(t('field.email'))"
                :error-messages="errors.email"
                aria-required="true"
            />
            <PasswordField
                v-model="password"
                name="password"
                :label="requiredLabel(t('field.password'))"
                :hint="t('module.users.add.passwordHint', { name: firstName || t('module.users.add.theUser') })"
                persistent-hint
                :error-messages="errors.password"
                autocomplete="new-password"
                aria-required="true"
            />
            <RoleSelect v-model="roleId" class="span-2" :error-messages="errors.roleId" />
        </div>
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
    import FormDialog from '@/components/FormDialog.vue'
    import PasswordField from '@/components/PasswordField.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import RoleSelect from '@/modules/users/components/RoleSelect.vue'
    import { useRolesQuery } from '@/modules/users/queries/useRolesQuery.ts'
    import { useUserCreateMutation } from '@/modules/users/mutations/useUserCreateMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const model = defineModel<boolean>({ required: true })
    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const router = useRouter()
    const errorMessage = ref<string | null>(null)
    const { mutateAsync, isPending } = useUserCreateMutation()
    const { data: roles } = useQuery(useRolesQuery())
    const defaultRoleId = computed(() => roles.value?.find((role) => role.type === 'user')?.roleId)

    const { defineField, handleSubmit, errors, resetForm, meta } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                firstName: z.string().trim().min(1),
                lastName: z.string().trim().min(1),
                email: z.email(),
                password: z.string().min(8),
                roleId: z.number(),
            }),
        ),
    })

    const [firstName] = defineField('firstName')
    const [lastName] = defineField('lastName')
    const [email] = defineField('email')
    const [password] = defineField('password')
    const [roleId] = defineField('roleId')

    watch(
        [model, defaultRoleId],
        ([open], previous) => {
            if (open && (!previous?.[0] || !meta.value.dirty)) {
                errorMessage.value = null
                resetForm({ values: { roleId: defaultRoleId.value } })
            }
        },
        { immediate: true },
    )

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            const { userId } = await mutateAsync(values)
            model.value = false
            await router.push({ name: RouteNames.USER_DETAILS, params: { userId } })
            notify.success(t('module.users.add.success'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.users.add.error'))
        }
    })
</script>
