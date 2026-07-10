<template>
    <VContainer>
        <VFadeTransition leave-absolute>
            <div v-if="!domain" class="d-flex justify-center">
                <VProgressCircular indeterminate size="128" class="mt-16" />
            </div>
            <div v-else>
                <RouterLink
                    :to="{ name: RouteNames.DOMAIN_LIST }"
                    class="text-secondary text-decoration-none d-flex mt-4 align-center gc-1"
                >
                    <VIcon icon="mdi-arrow-left" size="small" />
                    {{ t('cta.back') }}
                </RouterLink>
                <div class="d-flex justify-space-between align-center">
                    <h1 class="mt-0">{{ domain.fqdn }}</h1>
                    <DomainVerificationChip :domain="domain" />
                </div>
                <VDivider class="mb-6" />
                <DomainDnsCard :domain="domain" />
            </div>
        </VFadeTransition>
    </VContainer>
</template>

<script lang="ts" setup>
    import { useRouteParams } from '@vueuse/router'
    import { useQuery } from '@tanstack/vue-query'
    import { useDomainQuery } from '@/modules/domains/queries/useDomainQuery.ts'
    import DomainVerificationChip from '@/modules/domains/components/DomainVerificationChip.vue'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { useI18n } from 'vue-i18n'
    import DomainDnsCard from '@/modules/domains/views/details/partials/DomainDnsCard.vue'

    const domainId = useRouteParams('domainId', '', { transform: parseInt })
    const { data: domain } = useQuery(useDomainQuery(domainId))
    const { t } = useI18n()
</script>
