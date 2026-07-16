<template>
    <VContainer v-if="form">
        <div class="d-flex align-center gc-3">
            <VBtn
                icon="mdi-arrow-left"
                variant="text"
                size="small"
                :to="{ name: RouteNames.PROJECT_DETAILS, params: { projectId: form.projectId } }"
            />
            <h1>{{ form.name }}</h1>
            <VChip :color="form.isActive ? 'success' : 'default'" size="small">
                {{ form.isActive ? t('module.inboundForms.status.active') : t('module.inboundForms.status.inactive') }}
            </VChip>
        </div>
        <VDivider class="mb-6" />
        <div class="d-flex flex-column gr-6">
            <GeneralCard :form="form" />
            <FieldsCard :form="form" />
            <SecurityCard :form="form" />
            <ReceiversCard :form="form" />
        </div>
    </VContainer>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useRoute } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import { useInboundFormQuery } from '@/modules/inbound-forms/queries/useInboundFormQuery.ts'
    import GeneralCard from '@/modules/inbound-forms/views/details/partials/GeneralCard.vue'
    import FieldsCard from '@/modules/inbound-forms/views/details/partials/FieldsCard.vue'
    import SecurityCard from '@/modules/inbound-forms/views/details/partials/SecurityCard.vue'
    import ReceiversCard from '@/modules/inbound-forms/views/details/partials/ReceiversCard.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const route = useRoute()
    const { t } = useI18n()
    const { data: form } = useQuery(useInboundFormQuery(() => Number(route.params.inboundFormId)))
</script>
