<template>
    <VDialog max-width="600" v-model="model" @after-leave="resetForm" :persistent="isPending">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="t('title')">
            <template #append>
                <VIconBtn icon="mdi-close" @click="model = false" :disabled="isPending" />
            </template>
            <form @submit.prevent="onSubmit">
                <VCardItem>
                    <p>{{ t('intro') }}</p>
                    <VExpandTransition>
                        <div v-if="!isSubdomain">
                            <VAlert class="mb-4" color="warning">
                                <p class="text-black">{{ t('invalid-subdomain', { fqdn }) }}</p>
                            </VAlert>
                        </div>
                    </VExpandTransition>
                    <VTextField
                        name="fqdn"
                        :label="gt('field.domain')"
                        placeholder="mail.example.com"
                        v-model="fqdn"
                        :error-messages="errors.fqdn"
                    />
                </VCardItem>
                <VCardActions>
                    <VSpacer />
                    <VBtn color="error" :text="gt('cta.abort')" :disabled="isPending" @click="model = false" />
                    <VBtn color="primary" variant="elevated" :text="gt('cta.save')" :loading="isPending" type="submit" />
                </VCardActions>
            </form>
        </VCard>
    </VDialog>
</template>

<script lang="ts" setup>
    import { ref } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { parse } from 'tldts'
    import { useI18n } from 'vue-i18n'
    import { useDomainCreateMutation } from '@/modules/domains/mutations/useDomainCreateMutation.ts'
    import { useRouter } from 'vue-router'
    import { RouteNames } from '@/router/RouteNames.ts'

    const model = ref<undefined | boolean>()
    const isSubdomain = ref(false)
    const { t: gt } = useI18n({ useScope: 'global' })
    const { t } = useI18n()
    const { mutateAsync, isPending } = useDomainCreateMutation()
    const router = useRouter()

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                fqdn: z.string().and(
                    z.custom(
                        (value) => {
                            const { isIcann, domain, hostname } = parse(value as string)
                            isSubdomain.value = !isIcann || domain !== hostname
                            return !!isIcann
                        },
                        {
                            error: gt('validation.hostname'),
                        },
                    ),
                ),
            }),
        ),
    })

    const [fqdn] = defineField('fqdn')

    const onSubmit = handleSubmit(async (values) => {
        const { domainId } = await mutateAsync(values)
        void router.push({ name: RouteNames.DOMAIN_DETAILS, params: { domainId } })
    })
</script>

<i18n>
{
    "en": {
        "title": "New Domain",
        "intro": "Enter your domain name",
        "invalid-subdomain": "It is recommended to use a subdomain (e.g. mail.{fqdn})."
    }
}
</i18n>
