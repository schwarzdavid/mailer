<template>
    <VCard @click="openDetails">
        <template #prepend>
            <DomainVerificationChip :domain="domain" />
        </template>
        <template v-if="canDelete" #append>
            <div class="mr-n1">
                <VMenu location="bottom end" offset="8">
                    <template #activator="{ props }">
                        <VIconBtn
                            icon="mdi-dots-vertical"
                            :aria-label="t('module.domains.delete.title')"
                            v-bind="props"
                            @click.stop
                        />
                    </template>
                    <VList elevation="1" density="compact">
                        <DeleteDomainDialog :domain="domain" v-slot="{ props }">
                            <VListItem base-color="error" :title="t('module.domains.delete.action')" v-bind="props" />
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
    import { computed } from 'vue'
    import type { DomainDto } from 'api'
    import { useAbility } from '@casl/vue'
    import { useI18n } from 'vue-i18n'
    import DeleteDomainDialog from '@/modules/domains/components/dialogs/DeleteDomainDialog.vue'
    import { useRouter } from 'vue-router'
    import { RouteNames } from '@/router/RouteNames.ts'
    import DomainVerificationChip from '@/modules/domains/components/DomainVerificationChip.vue'

    const props = defineProps<{
        domain: DomainDto
    }>()

    const router = useRouter()
    const { t } = useI18n()
    const userAbility = useAbility()
    const can = userAbility.can.bind(userAbility)

    const canDelete = computed(() => can('delete', 'Domain'))

    function openDetails() {
        void router.push({
            name: RouteNames.DOMAIN_DETAILS,
            params: {
                domainId: props.domain.domainId,
            },
        })
    }
</script>
