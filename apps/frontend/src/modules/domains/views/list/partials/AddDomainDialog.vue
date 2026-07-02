<template>
    <VDialog max-width="600" v-model="model" @after-leave="resetForm">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="t('title')">
            <template #append>
                <VIconBtn icon="mdi-close" @click="model = false" />
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
                    <VTextField name="fqdn" :label="gt('field.domain')" placeholder="mail.example.com" v-model="fqdn" :error-messages="errors.fqdn" />
                </VCardItem>
                <VCardActions>
                    <VSpacer />
                    <VBtn color="error" :text="gt('cta.abort')"/>
                    <VBtn color="primary" variant="elevated" :text="gt('cta.save')"/>
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

    const model = ref<undefined | boolean>()
    const isSubdomain = ref(false)
    const { t: gt } = useI18n({ useScope: 'global' })
    const { t } = useI18n()

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
        console.log(values)
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
