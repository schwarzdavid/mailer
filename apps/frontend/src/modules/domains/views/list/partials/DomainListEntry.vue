<template>
    <VCard @click="openDetails">
        <template #prepend>
            <DomainVerificationChip :domain="domain" />
        </template>
        <template #append>
            <div class="mr-n1">
                <VMenu location="bottom end" offset="8">
                    <template #activator="{ props }">
                        <VIconBtn icon="mdi-dots-vertical" v-bind="props" />
                    </template>
                    <VList elevation="1" density="compact">
                        <DeleteDomainDialog v-slot="{ props }">
                            <VListItem base-color="error" title="Delete" v-bind="props" />
                        </DeleteDomainDialog>
                    </VList>
                </VMenu>
            </div>
        </template>
        <template #title>
            <span class="text-body-large pl-2">{{ props.domain.fqdn }}</span>
        </template>
    </VCard>
</template>

<script lang="ts" setup>
    import type { DomainDto } from 'api'
    import DeleteDomainDialog from '@/modules/domains/components/dialogs/DeleteDomainDialog.vue'
    import { useRouter } from 'vue-router'
    import { RouteNames } from '@/router/RouteNames.ts'
    import DomainVerificationChip from '@/modules/domains/components/DomainVerificationChip.vue'

    const props = defineProps<{
        domain: DomainDto
    }>()

    const router = useRouter()

    function openDetails() {
        void router.push({
            name: RouteNames.DOMAIN_DETAILS,
            params: {
                domainId: props.domain.domainId,
            },
        })
    }
</script>
