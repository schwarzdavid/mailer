<template>
    <VContainer>
        <div class="d-flex justify-space-between align-center">
            <h1>Domains</h1>
            <AddDomainDialog v-slot="{ props }">
                <VBtn v-bind="props">Add</VBtn>
            </AddDomainDialog>
        </div>
        <VDivider />
        <VFadeTransition leave-absolute>
            <div class="d-flex flex-column gr-3 pt-6" v-if="isPending">
                <VSkeletonLoader v-for="i in 3" :key="i" type="table-heading" />
            </div>
            <div class="d-flex flex-column gr-3 pt-6" v-else>
                <DomainListEntry v-for="domain in domains" :key="domain.domainId" :domain="domain" />
            </div>
        </VFadeTransition>
    </VContainer>
</template>

<script setup lang="ts">
    import AddDomainDialog from '@/modules/domains/views/list/partials/AddDomainDialog.vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useDomainsQuery } from '@/modules/domains/queries/useDomainsQuery.ts'
    import DomainListEntry from '@/modules/domains/views/list/partials/DomainListEntry.vue'

    const { data: domains, isPending } = useQuery(useDomainsQuery())
</script>
