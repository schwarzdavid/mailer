<template>
    <VCard class="login-card">
        <form novalidate class="login-card__form" @submit.prevent="onSubmit">
            <div class="login-card__intro">
                <h1 class="login-card__title">{{ t('module.auth.login.title') }}</h1>
                <p class="login-card__lead">{{ t('module.auth.login.intro') }}</p>
            </div>
            <InlineAlert v-if="errorMessage" tone="error" :text="errorMessage" />
            <InlineAlert v-else-if="sessionExpired" tone="info" :text="t('module.auth.login.expired')" />
            <VTextField
                v-model="email"
                :label="requiredLabel(t('field.email'))"
                type="email"
                name="email"
                :error-messages="errors.email"
                autocomplete="email"
                aria-required="true"
            />
            <PasswordField
                v-model="password"
                :label="requiredLabel(t('field.password'))"
                name="password"
                :error-messages="errors.password"
                autocomplete="current-password"
                aria-required="true"
            />
            <VBtn
                variant="flat"
                color="primary"
                type="submit"
                block
                :text="t('module.auth.login.submit')"
                :loading="isPending"
            />
        </form>
    </VCard>
</template>

<script lang="ts" setup>
    import { computed, nextTick, ref } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { zCredentialsDto } from 'api'
    import { useI18n } from 'vue-i18n'
    import { useTitle } from '@vueuse/core'
    import { useRoute, useRouter } from 'vue-router'
    import InlineAlert from '@/components/InlineAlert.vue'
    import PasswordField from '@/components/PasswordField.vue'
    import { useLoginMutation } from '@/modules/auth/mutations/useLoginMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { apiErrorStatus } from '@/helper/apiErrorStatus.ts'
    import { safeRedirect } from '@/helper/safeRedirect.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const { mutateAsync, isPending } = useLoginMutation()
    const route = useRoute()
    const router = useRouter()
    const errorMessage = ref<string | null>(null)

    useTitle(() => t('app.documentTitle', { page: t('module.auth.login.title') }))

    const sessionExpired = computed(() => route.query.expired === '1')

    const { handleSubmit, defineField, errors } = useForm({
        validationSchema: toTypedSchema(zCredentialsDto),
    })

    const [email] = defineField('email')
    const [password] = defineField('password')

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            await mutateAsync(values)
        } catch (error) {
            errorMessage.value =
                apiErrorStatus(error) === 401
                    ? t('module.auth.login.invalidCredentials')
                    : apiErrorMessage(error, t('module.auth.login.error'))
            await nextTick()
            document.querySelector<HTMLInputElement>('input[name="password"]')?.select()
            return
        }
        void router.push(safeRedirect(route.query.redirect) ?? { name: RouteNames.DASHBOARD })
    })
</script>

<style scoped>
    .login-card {
        width: 100%;
        background: rgb(var(--v-theme-surface));
    }

    .login-card__form {
        display: grid;
        gap: 20px;
        padding: 24px;
    }

    .login-card__intro {
        display: grid;
        gap: 4px;
    }

    .login-card__title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        line-height: 1.75rem;
    }

    .login-card__lead {
        margin: 0;
        color: rgb(var(--v-theme-ink-muted));
    }
</style>
