<template>
    <VContainer>
        <div class="d-flex justify-space-between align-center">
            <h1>Domains</h1>
            <AddDomainDialog v-slot="{ props }">
                <VBtn v-bind="props">Add</VBtn>
            </AddDomainDialog>
        </div>
        <VDivider />
    </VContainer>
</template>

<script setup lang="ts">
    import AddDomainDialog from '@/modules/domains/views/list/partials/AddDomainDialog.vue'
</script>
