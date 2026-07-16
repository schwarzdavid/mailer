<template>
    <VDialog max-width="600" v-model="model" @after-leave="resetForm" :persistent="isPending">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="t('module.inboundForms.add.title')">
            <template #append>
                <VIconBtn icon="mdi-close" @click="model = false" :disabled="isPending" />
            </template>
            <form @submit.prevent="onSubmit">
                <VCardItem>
                    <p class="mb-4">{{ t('module.inboundForms.add.intro') }}</p>
                    <VTextField name="name" :label="t('field.name')" v-model="name" :error-messages="errors.name" />
                    <VTextField name="slug" :label="t('field.slug')" v-model="slug" :error-messages="errors.slug" />
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
    import { ref, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import { useQuery } from '@tanstack/vue-query'
    import { useRouter } from 'vue-router'
    import { useProjectQuery } from '@/modules/projects/queries/useProjectQuery.ts'
    import { useInboundFormCreateMutation } from '@/modules/inbound-forms/mutations/useInboundFormCreateMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ projectId: number }>()

    const model = ref<undefined | boolean>()
    const slugTouched = ref(false)
    const { t } = useI18n()
    const { data: project } = useQuery(useProjectQuery(() => props.projectId))
    const { mutateAsync, isPending } = useInboundFormCreateMutation()
    const router = useRouter()

    const { defineField, handleSubmit, errors, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                name: z.string().min(1).max(255),
                slug: z
                    .string()
                    .min(1)
                    .max(255)
                    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
                domainId: z.number().nullable().optional(),
            }),
        ),
    })

    const [name] = defineField('name')
    const [slug] = defineField('slug')
    const [domainId] = defineField('domainId')

    watch(name, (value) => {
        if (!slugTouched.value) {
            slug.value = slugify(value ?? '')
        }
    })

    watch(slug, (value, oldValue) => {
        if (value !== slugify(name.value ?? '') && value !== oldValue) {
            slugTouched.value = true
        }
    })

    function slugify(value: string): string {
        return value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
    }

    const onSubmit = handleSubmit(async (values) => {
        const { inboundFormId } = await mutateAsync({
            name: values.name,
            slug: values.slug,
            domainId: values.domainId ?? null,
            projectId: props.projectId,
        })
        void router.push({ name: RouteNames.INBOUND_FORM_DETAILS, params: { inboundFormId } })
    })
</script>
