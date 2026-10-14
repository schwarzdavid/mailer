<template>
    <VDialog max-width="600" v-model="model" @after-leave="onAfterLeave" :persistent="isPending">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="t('module.domains.add.title')">
            <template #append>
                <VIconBtn icon="mdi-close" @click="model = false" :disabled="isPending" />
            </template>
            <form @submit.prevent="onSubmit">
                <VCardItem>
                    <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
                    <p>{{ t('module.domains.add.intro') }}</p>
                    <VExpandTransition>
                        <div v-if="isApexDomain">
                            <VAlert class="mb-4" color="warning" icon="mdi-alert">
                                <p class="text-black">{{ t('module.domains.add.invalidSubdomain', { fqdn }) }}</p>
                            </VAlert>
                        </div>
                    </VExpandTransition>
                    <VTextField
                        name="fqdn"
                        :label="t('field.domain')"
                        placeholder="mail.example.com"
                        v-model="fqdn"
                        :error-messages="errors.fqdn"
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

<script lang="ts" setup>
    import { computed, ref } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { parse } from 'tldts'
    import { useI18n } from 'vue-i18n'
    import { useDomainCreateMutation } from '@/modules/domains/mutations/useDomainCreateMutation.ts'
    import { useRouter } from 'vue-router'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const model = ref<undefined | boolean>()
    const errorMessage = ref<string | null>(null)
    const { t } = useI18n()
    const { mutateAsync, isPending } = useDomainCreateMutation()
    const router = useRouter()

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                fqdn: z.string().and(
                    z.custom((value) => !!parse(value as string).isIcann, {
                        error: t('validation.hostname'),
                    }),
                ),
            }),
        ),
    })

    const [fqdn] = defineField('fqdn')

    const isApexDomain = computed(() => {
        if (!fqdn.value) {
            return false
        }
        const { isIcann, domain, hostname } = parse(fqdn.value)
        return !!isIcann && domain === hostname
    })

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            const { domainId } = await mutateAsync(values)
            void router.push({ name: RouteNames.DOMAIN_DETAILS, params: { domainId } })
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.domains.add.error'))
        }
    })

    function onAfterLeave() {
        errorMessage.value = null
        resetForm()
    }
</script>
