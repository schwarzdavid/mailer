<template>
    <VContainer>
        <div class="d-flex justify-space-between align-center">
            <h1>{{ t('module.inboundForms.list.title') }}</h1>
            <AddInboundFormDialog v-slot="{ props }">
                <VBtn v-bind="props">{{ t('cta.add') }}</VBtn>
            </AddInboundFormDialog>
        </div>
        <VDivider />
        <VFadeTransition leave-absolute>
            <div class="d-flex flex-column gr-3 pt-6" v-if="isPending">
                <VSkeletonLoader v-for="i in 3" :key="i" type="table-heading" />
            </div>
            <div class="d-flex flex-column gr-3 pt-6" v-else>
                <InboundFormListEntry v-for="form in forms" :key="form.inboundFormId" :form="form" />
            </div>
        </VFadeTransition>
    </VContainer>
</template>

<script setup lang="ts">
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useInboundFormsQuery } from '@/modules/inbound-forms/queries/useInboundFormsQuery.ts'
    import InboundFormListEntry from '@/modules/inbound-forms/views/list/partials/InboundFormListEntry.vue'
    import AddInboundFormDialog from '@/modules/inbound-forms/views/list/partials/AddInboundFormDialog.vue'

    const { data: forms, isPending } = useQuery(useInboundFormsQuery())
    const { t } = useI18n()
</script>
