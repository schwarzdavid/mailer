<template>
    <div>
        <p class="mb-6">{{ t('module.onboarding.steps.account.intro') }}</p>
        <form novalidate @submit.prevent="onSubmit">
            <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
            <VTextField
                v-model="firstName"
                name="firstName"
                :label="t('field.firstName')"
                :error-messages="errors.firstName"
                autocomplete="given-name"
            />
            <VTextField
                v-model="lastName"
                name="lastName"
                :label="t('field.lastName')"
                :error-messages="errors.lastName"
                autocomplete="family-name"
            />
            <VTextField
                v-model="email"
                :label="t('field.email')"
                type="email"
                :error-messages="errors.email"
                autocomplete="email"
            />
            <VTextField
                v-model="password"
                :label="t('field.password')"
                type="password"
                :error-messages="errors.password"
                autocomplete="new-password"
            />
            <div class="d-flex justify-end">
                <VBtn type="submit" :text="t('cta.continue')" :loading="isPending" />
            </div>
        </form>
    </div>
</template>

<script lang="ts" setup>
    import { ref } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { zRegisterUserDto } from 'api'
    import { useI18n } from 'vue-i18n'
    import { useRegisterMutation } from '@/modules/onboarding/mutations/useRegisterMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const emit = defineEmits<{
        completed: []
    }>()

    const { t } = useI18n()
    const { mutateAsync, isPending } = useRegisterMutation()
    const errorMessage = ref<string | null>(null)

    const { handleSubmit, defineField, errors } = useForm({
        validationSchema: toTypedSchema(
            zRegisterUserDto.extend({
                firstName: z.string().trim().min(1),
                lastName: z.string().trim().min(1),
            }),
        ),
    })

    const [firstName] = defineField('firstName')
    const [lastName] = defineField('lastName')
    const [email] = defineField('email')
    const [password] = defineField('password')

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            await mutateAsync(values)
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.onboarding.steps.account.error'))
            return
        }
        emit('completed')
    })
</script>
