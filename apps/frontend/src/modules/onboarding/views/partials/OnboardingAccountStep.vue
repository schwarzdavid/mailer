<template>
    <SectionCard :title="t('module.setup.account.title')" :description="t('module.setup.account.description')">
        <form id="setup-account" class="form-grid form-grid--2" novalidate @submit.prevent="onSubmit">
            <InlineAlert
                v-if="errorMessage"
                class="span-2"
                tone="error"
                :title="t('module.setup.account.error')"
                :text="errorMessage"
            />
            <VTextField
                v-model="firstName"
                name="firstName"
                :label="requiredLabel(t('field.firstName'))"
                :error-messages="errors.firstName"
                autocomplete="given-name"
                aria-required="true"
            />
            <VTextField
                v-model="lastName"
                name="lastName"
                :label="requiredLabel(t('field.lastName'))"
                :error-messages="errors.lastName"
                autocomplete="family-name"
                aria-required="true"
            />
            <VTextField
                v-model="email"
                class="span-2"
                name="email"
                type="email"
                :label="requiredLabel(t('field.email'))"
                :error-messages="errors.email"
                autocomplete="email"
                aria-required="true"
            />
            <PasswordField
                v-model="password"
                class="span-2"
                name="password"
                :label="requiredLabel(t('field.password'))"
                :hint="t('field.passwordHint')"
                persistent-hint
                :error-messages="errors.password"
                autocomplete="new-password"
                aria-required="true"
            />
        </form>
        <template #footer>
            <VBtn
                variant="flat"
                color="primary"
                type="submit"
                form="setup-account"
                :text="t('module.setup.account.submit')"
                :loading="isPending"
            />
        </template>
    </SectionCard>
</template>

<script lang="ts" setup>
    import { ref } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { zRegisterUserDto } from 'api'
    import { useI18n } from 'vue-i18n'
    import InlineAlert from '@/components/InlineAlert.vue'
    import PasswordField from '@/components/PasswordField.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { useRegisterMutation } from '@/modules/onboarding/mutations/useRegisterMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const emit = defineEmits<{ completed: [] }>()

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
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
            errorMessage.value = apiErrorMessage(error, t('dialog.tryAgain'))
            return
        }
        emit('completed')
    })
</script>
