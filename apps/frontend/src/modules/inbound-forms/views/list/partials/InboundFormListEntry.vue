<template>
    <VCard :to="{ name: RouteNames.INBOUND_FORM_DETAILS, params: { inboundFormId: form.inboundFormId } }" hover>
        <VCardItem>
            <template #title>
                {{ form.name }}
            </template>
            <template #subtitle>
                {{ form.slug }}
            </template>
            <template #append>
                <VChip :color="form.isActive ? 'success' : 'default'" size="small">
                    {{
                        form.isActive
                            ? t('module.inboundForms.status.active')
                            : t('module.inboundForms.status.inactive')
                    }}
                </VChip>
            </template>
        </VCardItem>
    </VCard>
</template>

<script setup lang="ts">
    import type { InboundFormDto } from 'api'
    import { useI18n } from 'vue-i18n'
    import { RouteNames } from '@/router/RouteNames.ts'

    defineProps<{ form: InboundFormDto }>()

    const { t } = useI18n()
</script>
