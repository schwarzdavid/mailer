<template>
    <div class="dashboard-stats">
        <StatTile
            :label="t('module.dashboard.stats.projects')"
            :value="data.projects.data.value?.length"
            :loading="data.projects.isPending.value"
            :to="{ name: RouteNames.PROJECT_LIST }"
        >
            <template v-if="deletedCount">{{
                t('module.dashboard.stats.deleted', { count: deletedCount }, deletedCount)
            }}</template>
        </StatTile>
        <StatTile
            :label="t('module.dashboard.stats.activeForms')"
            :value="activeForms.length"
            :total="t('module.dashboard.stats.of', { total: forms.length })"
            :loading="data.forms.isPending.value"
            :to="{ name: RouteNames.PROJECT_LIST }"
        >
            <template v-if="inactiveForms.length === 1">{{
                t('module.dashboard.stats.formOff', { name: inactiveForms[0]!.name })
            }}</template>
            <template v-else-if="inactiveForms.length > 1">
                {{ t('module.dashboard.stats.formsOff', { count: inactiveForms.length }) }}
            </template>
        </StatTile>
        <StatTile
            v-if="data.canReadDomains.value"
            :label="t('module.dashboard.stats.senderDomains')"
            :value="data.validDomains.value.length"
            :total="t('module.dashboard.stats.ofValid', { total: data.domains.data.value?.length ?? 0 })"
            :loading="data.domains.isPending.value"
            :to="{ name: RouteNames.DOMAIN_LIST }"
        >
            <template v-if="data.invalidDomains.value.length">
                <StatusDot tone="warning" />
                {{
                    t(
                        'module.dashboard.stats.needRecords',
                        { count: data.invalidDomains.value.length },
                        data.invalidDomains.value.length,
                    )
                }}
            </template>
        </StatTile>
        <StatTile
            v-if="data.canReadBounces.value"
            :label="t('module.dashboard.stats.bounces')"
            :value="weekTotal"
            :loading="data.weekBounces.isPending.value"
            :to="{ name: RouteNames.BOUNCE_LIST }"
        >
            <template v-if="weekTotal">
                {{
                    t('module.dashboard.stats.bounceSplit', {
                        permanent: permanentTotal,
                        transient: weekTotal - permanentTotal,
                    })
                }}
            </template>
        </StatTile>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import StatTile from '@/components/StatTile.vue'
    import StatusDot from '@/components/StatusDot.vue'
    import type { useDashboardData } from '@/modules/dashboard/composables/useDashboardData.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ data: ReturnType<typeof useDashboardData> }>()

    const { t } = useI18n()

    const forms = computed(() => props.data.forms.data.value ?? [])
    const activeForms = computed(() => forms.value.filter((form) => form.isActive))
    const inactiveForms = computed(() => forms.value.filter((form) => !form.isActive))
    const deletedCount = computed(() => props.data.deletedProjects.data.value?.length ?? 0)
    const weekTotal = computed(() => props.data.weekBounces.data.value?.total ?? 0)
    const permanentTotal = computed(() => props.data.permanentBounces.data.value?.total ?? 0)
</script>

<style scoped>
    .dashboard-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
    }

    @media (max-width: 599.98px) {
        .dashboard-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>
