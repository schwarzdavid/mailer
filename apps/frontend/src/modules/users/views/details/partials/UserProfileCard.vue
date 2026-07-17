<template>
    <VCard :title="t('module.users.details.profile.title')">
        <form @submit.prevent="onSubmit">
            <VCardItem>
                <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
                <VTextField
                    name="firstName"
                    :label="t('field.firstName')"
                    v-model="firstName"
                    :error-messages="errors.firstName"
                    :disabled="!canEdit"
                />
                <VTextField
                    name="lastName"
                    :label="t('field.lastName')"
                    v-model="lastName"
                    :error-messages="errors.lastName"
                    :disabled="!canEdit"
                />
                <VTextField
                    name="email"
                    :label="t('field.email')"
                    v-model="email"
                    :error-messages="errors.email"
                    :disabled="!canEdit"
                />
                <VTextField
                    name="password"
                    type="password"
                    :label="t('module.users.details.profile.newPassword')"
                    v-model="password"
                    :error-messages="errors.password"
                    :disabled="!canEdit"
                />
                <VSelect
                    name="roleId"
                    :label="t('field.role')"
                    :items="roleOptions"
                    item-title="name"
                    item-value="roleId"
                    v-model="roleId"
                    :error-messages="errors.roleId"
                    :disabled="!canEdit"
                />
            </VCardItem>
            <VCardActions v-if="canEdit">
                <VSpacer />
                <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="isPending" type="submit" />
            </VCardActions>
        </form>
    </VCard>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { useQuery } from '@tanstack/vue-query'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import type { UserDetailDto } from 'api'
    import { useRolesQuery } from '@/modules/users/queries/useRolesQuery.ts'
    import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
    import { useUserUpdateMutation } from '@/modules/users/mutations/useUserUpdateMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const props = defineProps<{ user: UserDetailDto }>()
    const { t } = useI18n()
    const userAbility = useAbility()
    const can = userAbility.can.bind(userAbility)
    const errorMessage = ref<string | null>(null)
    const { mutateAsync, isPending } = useUserUpdateMutation()
    const { data: roles } = useQuery(useRolesQuery())
    const { data: currentUser } = useQuery(useAuthQuery())

    const canEdit = computed(() => can('update', subject('User', { ...props.user })))
    const roleOptions = computed(() =>
        (roles.value ?? []).filter(
            (role) =>
                role.type !== 'super_admin' ||
                currentUser.value?.role.type === 'super_admin' ||
                props.user.role.type === 'super_admin',
        ),
    )

    const { defineField, handleSubmit, errors } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                firstName: z.string().min(1),
                lastName: z.string().min(1),
                email: z.email(),
                password: z.string().min(8).optional().or(z.literal('')),
                roleId: z.number(),
            }),
        ),
        initialValues: {
            firstName: props.user.firstName,
            lastName: props.user.lastName,
            email: props.user.email,
            password: '',
            roleId: props.user.role.roleId,
        },
    })

    const [firstName] = defineField('firstName')
    const [lastName] = defineField('lastName')
    const [email] = defineField('email')
    const [password] = defineField('password')
    const [roleId] = defineField('roleId')

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            await mutateAsync({
                userId: props.user.userId,
                body: {
                    firstName: values.firstName,
                    lastName: values.lastName,
                    email: values.email,
                    roleId: values.roleId,
                    ...(values.password ? { password: values.password } : {}),
                },
            })
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.users.details.profile.error'))
        }
    })
</script>
