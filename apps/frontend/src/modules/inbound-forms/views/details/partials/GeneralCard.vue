<template>
    <VCard :title="t('module.inboundForms.details.general.title')">
        <form @submit.prevent="onSubmit">
            <VCardItem>
                <VTextField name="name" :label="t('field.name')" v-model="name" :error-messages="errors.name" />
                <VTextField name="slug" :label="t('field.slug')" v-model="slug" :error-messages="errors.slug" />
                <VTextField :label="t('field.project')" :model-value="project?.name" readonly />
                <VSelect
                    name="domainId"
                    :label="t('field.domain')"
                    v-model="domainId"
                    :items="project?.domains ?? []"
                    item-title="fqdn"
                    item-value="domainId"
                    clearable
                    :error-messages="errors.domainId"
                />
                <VSwitch name="isActive" :label="t('module.inboundForms.status.active')" v-model="isActive" />
                <VTextField :label="t('module.inboundForms.details.endpoint')" :model-value="endpointUrl" readonly>
                    <template #append-inner>
                        <VBtn
                            variant="text"
                            size="small"
                            :text="copied ? t('cta.copy.success') : t('cta.copy.default')"
                            @click="copyEndpoint"
                        />
                    </template>
                </VTextField>
            </VCardItem>
            <VCardActions>
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
    import type { InboundFormDetailDto } from 'api'
    import { useProjectQuery } from '@/modules/projects/queries/useProjectQuery.ts'
    import { useInboundFormUpdateMutation } from '@/modules/inbound-forms/mutations/useInboundFormUpdateMutation.ts'
    import { formEndpointUrl } from '@/modules/inbound-forms/helpers/formEndpointUrl.ts'

    const props = defineProps<{ form: InboundFormDetailDto }>()

    const { t } = useI18n()
    const { data: project } = useQuery(useProjectQuery(() => props.form.projectId))
    const { mutateAsync, isPending } = useInboundFormUpdateMutation()
    const copied = ref(false)

    const endpointUrl = computed(() => formEndpointUrl(props.form.slug))

    const { defineField, handleSubmit, errors } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z.string().min(1).max(255),
                slug: z
                    .string()
                    .min(1)
                    .max(255)
                    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
                domainId: z.number().nullable().optional(),
                isActive: z.boolean(),
            }),
        ),
        initialValues: {
            name: props.form.name,
            slug: props.form.slug,
            domainId: props.form.domainId,
            isActive: props.form.isActive,
        },
    })

    const [name] = defineField('name')
    const [slug] = defineField('slug')
    const [domainId] = defineField('domainId')
    const [isActive] = defineField('isActive')

    async function copyEndpoint() {
        await navigator.clipboard.writeText(endpointUrl.value)
        copied.value = true
        setTimeout(() => (copied.value = false), 2000)
    }

    const onSubmit = handleSubmit(async (values) => {
        await mutateAsync({
            inboundFormId: props.form.inboundFormId,
            update: {
                name: values.name,
                slug: values.slug,
                domainId: values.domainId ?? null,
                isActive: values.isActive,
            },
        })
    })
</script>
