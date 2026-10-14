<template>
    <SectionCard
        danger
        :title="t('module.inboundForms.details.delete.title')"
        :description="t('module.inboundForms.details.delete.description')"
    >
        <template #actions>
            <VBtn color="error" :text="t('module.inboundForms.details.delete.action')" @click="confirmDelete" />
        </template>
    </SectionCard>
</template>

<script setup lang="ts">
    import { useI18n } from 'vue-i18n'
    import { useRouter } from 'vue-router'
    import type { InboundFormDetailDto } from 'api'
    import SectionCard from '@/components/SectionCard.vue'
    import { useConfirm } from '@/composables/useConfirm.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { SLUG_PREFIX } from '@/modules/inbound-forms/helpers/slug.ts'
    import { useInboundFormDeleteMutation } from '@/modules/inbound-forms/mutations/useInboundFormDeleteMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ form: InboundFormDetailDto }>()

    const { t } = useI18n()
    const confirm = useConfirm()
    const notify = useNotify()
    const router = useRouter()
    const { mutateAsync } = useInboundFormDeleteMutation()

    async function confirmDelete() {
        const confirmed = await confirm({
            title: t('module.inboundForms.details.delete.confirmTitle', { name: props.form.name }),
            body: t('module.inboundForms.details.delete.confirmBody', {
                endpoint: `${SLUG_PREFIX}${props.form.slug}`,
                fields: props.form.fields.length,
                checks: props.form.security.length,
                receivers: props.form.receivers.length,
            }),
            confirmLabel: t('module.inboundForms.details.delete.confirm'),
            destructive: true,
            errorText: t('module.inboundForms.details.delete.error'),
            action: () => mutateAsync(props.form.inboundFormId),
        })
        if (!confirmed) {
            return
        }
        await router.push({ name: RouteNames.PROJECT_DETAILS, params: { projectId: props.form.projectId } })
        notify.success(t('module.inboundForms.details.delete.done', { name: props.form.name }))
    }
</script>
