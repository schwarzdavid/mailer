<template>
    <FormDialog
        v-model="model"
        :title="t('module.domains.add.title')"
        :submit-label="t('module.domains.add.submit')"
        :pending="isPending"
        :error="errorMessage"
        @submit="onSubmit"
    >
        <i18n-t keypath="module.domains.add.intro" tag="p">
            <template #example><code>forms.example.com</code></template>
        </i18n-t>
        <VTextField
            v-model="fqdn"
            name="fqdn"
            class="mono-field"
            :label="requiredLabel(t('field.domain'))"
            placeholder="forms.example.com"
            :error-messages="errors.fqdn"
            aria-required="true"
        />
        <InlineAlert v-if="apexDomain" tone="warning" :title="t('module.domains.add.apex.title')">
            {{ t('module.domains.add.apex.text', { fqdn: apexDomain, example: `mail.${apexDomain}` }) }}
        </InlineAlert>
    </FormDialog>
</template>

<script lang="ts" setup>
    import { computed, ref, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { parse } from 'tldts'
    import { useI18n } from 'vue-i18n'
    import { useRouter } from 'vue-router'
    import FormDialog from '@/components/FormDialog.vue'
    import InlineAlert from '@/components/InlineAlert.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { useDomainCreateMutation } from '@/modules/domains/mutations/useDomainCreateMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const model = defineModel<boolean>({ required: true })
    const errorMessage = ref<string | null>(null)
    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const { mutateAsync, isPending } = useDomainCreateMutation()
    const router = useRouter()

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                fqdn: z
                    .string()
                    .trim()
                    .min(1)
                    .refine((value) => !!parse(value).isIcann, { error: () => t('validation.hostname') }),
            }),
        ),
    })

    const [fqdn] = defineField('fqdn')

    const apexDomain = computed(() => {
        if (!fqdn.value) {
            return undefined
        }
        const { isIcann, domain, hostname } = parse(fqdn.value.trim())
        return isIcann && domain === hostname ? (domain ?? undefined) : undefined
    })

    watch(
        model,
        (open) => {
            if (open) {
                errorMessage.value = null
                resetForm()
            }
        },
        { immediate: true },
    )

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            const { domainId } = await mutateAsync({ fqdn: values.fqdn })
            model.value = false
            await router.push({ name: RouteNames.DOMAIN_DETAILS, params: { domainId } })
            notify.success(t('module.domains.add.success', { fqdn: values.fqdn }))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.domains.add.error'))
        }
    })
</script>
