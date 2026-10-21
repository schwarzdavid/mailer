<template>
    <SectionCard
        :title="t('module.inboundForms.details.endpoint.title')"
        :description="t('module.inboundForms.details.endpoint.description')"
    >
        <CopyField :value="endpointUrl" :label="t('module.inboundForms.details.endpoint.copyLabel')" />
        <VSwitch
            v-if="canUpdate"
            :model-value="isActive"
            name="isActive"
            :label="t('module.inboundForms.details.endpoint.accept')"
            :messages="t('module.inboundForms.details.endpoint.acceptHint')"
            :loading="isPending ? 'ink' : false"
            :readonly="isPending"
            @update:model-value="toggle"
        />
        <ReadonlyValue
            v-else
            :label="t('module.inboundForms.details.endpoint.accept')"
            :value="
                form.isActive
                    ? t('module.inboundForms.details.endpoint.on')
                    : t('module.inboundForms.details.endpoint.off')
            "
        />
        <DisclosureBox v-if="!xs" :summary="t('module.inboundForms.details.endpoint.example')">
            <CopyField :value="example" :label="t('module.inboundForms.details.endpoint.exampleLabel')" />
        </DisclosureBox>
    </SectionCard>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useDisplay } from 'vuetify'
    import type { InboundFormDetailDto } from 'api'
    import CopyField from '@/components/CopyField.vue'
    import DisclosureBox from '@/components/DisclosureBox.vue'
    import ReadonlyValue from '@/components/ReadonlyValue.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { formEndpointUrl } from '@/modules/inbound-forms/helpers/formEndpointUrl.ts'
    import { exampleRequest } from '@/modules/inbound-forms/helpers/integrationSnippets.ts'
    import { useInboundFormUpdateMutation } from '@/modules/inbound-forms/mutations/useInboundFormUpdateMutation.ts'

    const props = defineProps<{ form: InboundFormDetailDto; canUpdate: boolean }>()

    const { t } = useI18n()
    const { xs } = useDisplay()
    const notify = useNotify()
    const { mutateAsync, isPending } = useInboundFormUpdateMutation()
    const isActive = ref(props.form.isActive)

    const endpointUrl = computed(() => formEndpointUrl(props.form.slug))
    const example = computed(() => exampleRequest(endpointUrl.value, props.form.fields))

    watch(
        () => props.form.isActive,
        (value) => {
            isActive.value = value
        },
    )

    async function toggle(value: boolean | null) {
        const next = !!value
        isActive.value = next
        try {
            await mutateAsync({ inboundFormId: props.form.inboundFormId, update: { isActive: next } })
            notify.success(
                next
                    ? t('module.inboundForms.details.endpoint.activated')
                    : t('module.inboundForms.details.endpoint.deactivated'),
            )
        } catch {
            isActive.value = !next
            notify.error(t('module.inboundForms.details.endpoint.toggleFailed'), { retry: () => void toggle(next) })
        }
    }
</script>
