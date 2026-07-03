<template>
    <div>
        <h1 class="text-center mb-0">{{ t('module.auth.login.title') }}</h1>
        <p class="text-center mb-8 mt-2 text-medium-emphasis">{{ t('module.auth.login.intro') }}</p>
        <form novalidate @submit.prevent="onSubmit">
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
                autocomplete="current-password"
            />
            <VBtn type="submit" :text="t('cta.login')" :loading="isPending" />
        </form>
    </div>
</template>

<script lang="ts" setup>
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { zCredentialsDto } from 'api'
    import { useI18n } from 'vue-i18n'
    import { useLoginMutation } from '@/modules/auth/mutations/useLoginMutation.ts'
    import { useRouter } from 'vue-router'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const { mutateAsync, isPending } = useLoginMutation()
    const router = useRouter()

    const { handleSubmit, defineField, errors } = useForm({
        validationSchema: toTypedSchema(zCredentialsDto),
    })

    const [email] = defineField('email')
    const [password] = defineField('password')

    const onSubmit = handleSubmit(async (values) => {
        await mutateAsync(values)
        void router.push({ name: RouteNames.DASHBOARD })
    })
</script>
