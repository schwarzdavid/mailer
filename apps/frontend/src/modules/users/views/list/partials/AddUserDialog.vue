<template>
    <VDialog max-width="600" v-model="model" @after-leave="onAfterLeave" :persistent="isPending">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="t('module.users.add.title')">
            <template #append>
                <VIconBtn icon="mdi-close" @click="model = false" :disabled="isPending" />
            </template>
            <form @submit.prevent="onSubmit">
                <VCardItem>
                    <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
                    <p class="mb-4">{{ t('module.users.add.intro') }}</p>
                    <VTextField
                        name="firstName"
                        :label="t('field.firstName')"
                        v-model="firstName"
                        :error-messages="errors.firstName"
                    />
                    <VTextField
                        name="lastName"
                        :label="t('field.lastName')"
                        v-model="lastName"
                        :error-messages="errors.lastName"
                    />
                    <VTextField name="email" :label="t('field.email')" v-model="email" :error-messages="errors.email" />
                    <VTextField
                        name="password"
                        type="password"
                        :label="t('field.password')"
                        v-model="password"
                        :error-messages="errors.password"
                    />
                    <VSelect
                        name="roleId"
                        :label="t('field.role')"
                        :items="roleOptions"
                        item-title="name"
                        item-value="roleId"
                        v-model="roleId"
                        :error-messages="errors.roleId"
                    />
                </VCardItem>
                <VCardActions>
                    <VSpacer />
                    <VBtn color="error" :text="t('cta.abort')" :disabled="isPending" @click="model = false" />
                    <VBtn color="primary" variant="elevated" :text="t('cta.save')" :loading="isPending" type="submit" />
                </VCardActions>
            </form>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { useRouter } from 'vue-router'
    import { useQuery } from '@tanstack/vue-query'
    import { useRolesQuery } from '@/modules/users/queries/useRolesQuery.ts'
    import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
    import { useUserCreateMutation } from '@/modules/users/mutations/useUserCreateMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const model = ref<undefined | boolean>()
    const { t } = useI18n()
    const router = useRouter()
    const errorMessage = ref<string | null>(null)
    const { mutateAsync, isPending } = useUserCreateMutation()
    const { data: roles } = useQuery(useRolesQuery())
    const { data: currentUser } = useQuery(useAuthQuery())

    const roleOptions = computed(() =>
        (roles.value ?? []).filter(
            (role) => role.type !== 'super_admin' || currentUser.value?.role.type === 'super_admin',
        ),
    )

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                firstName: z.string().min(1),
                lastName: z.string().min(1),
                email: z.email(),
                password: z.string().min(8),
                roleId: z.number().optional(),
            }),
        ),
    })

    const [firstName] = defineField('firstName')
    const [lastName] = defineField('lastName')
    const [email] = defineField('email')
    const [password] = defineField('password')
    const [roleId] = defineField('roleId')

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            const { userId } = await mutateAsync(values)
            void router.push({ name: RouteNames.USER_DETAILS, params: { userId } })
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.users.add.error'))
        }
    })

    function onAfterLeave() {
        errorMessage.value = null
        resetForm()
    }
</script>
