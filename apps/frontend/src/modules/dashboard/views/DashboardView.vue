<template>
    <PageHeader :title="t('nav.dashboard')" :description="greeting" />
    <div class="page-stack">
        <DashboardStats v-if="hasProjects || !isNewInstall" :data="data" />
        <NeedsAttentionCard :data="data" />
        <GetStartedCard v-if="isNewInstall" :data="data" />
        <div v-if="hasProjects" class="dashboard-columns">
            <FormsByProjectCard :data="data" />
            <div class="page-stack">
                <DeliveryHealthCard v-if="data.health.canRead.value || data.canReadDomains.value" :data="data" />
                <RecentBouncesCard v-if="data.canReadBounces.value" :data="data" />
            </div>
        </div>
        <SectionCard v-if="isNewInstall" :title="t('module.dashboard.explainer.title')">
            <ul class="dashboard-explainer">
                <li v-for="key in ['sendingDomain', 'senderDomains', 'projects', 'forms']" :key="key">
                    <strong>{{ t(`module.dashboard.explainer.${key}.term`) }}</strong>
                    {{ t(`module.dashboard.explainer.${key}.text`) }}
                </li>
            </ul>
        </SectionCard>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import PageHeader from '@/components/PageHeader.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useAuthQuery } from '@/modules/auth/queries/useAuthQuery.ts'
    import { useDashboardData } from '@/modules/dashboard/composables/useDashboardData.ts'
    import { useGetStartedSteps } from '@/modules/dashboard/composables/useGetStartedSteps.ts'
    import DashboardStats from '@/modules/dashboard/views/partials/DashboardStats.vue'
    import DeliveryHealthCard from '@/modules/dashboard/views/partials/DeliveryHealthCard.vue'
    import FormsByProjectCard from '@/modules/dashboard/views/partials/FormsByProjectCard.vue'
    import GetStartedCard from '@/modules/dashboard/views/partials/GetStartedCard.vue'
    import NeedsAttentionCard from '@/modules/dashboard/views/partials/NeedsAttentionCard.vue'
    import RecentBouncesCard from '@/modules/dashboard/views/partials/RecentBouncesCard.vue'

    const { t } = useI18n()
    const { data: user } = useQuery(useAuthQuery())
    const data = useDashboardData()
    const steps = useGetStartedSteps(data)

    const hasProjects = computed(() => (data.projects.data.value?.length ?? 0) > 0)
    const isNewInstall = computed(() => steps.visible.value)

    const greeting = computed(() => {
        if (isNewInstall.value && !hasProjects.value) {
            return t('module.dashboard.greeting.newInstall')
        }
        return t('module.dashboard.greeting.default', { name: user.value?.firstName ?? '' })
    })
</script>

<style scoped>
    .dashboard-columns {
        display: grid;
        grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
        gap: 24px;
        align-items: start;
    }

    .dashboard-explainer {
        display: grid;
        gap: 8px;
        margin: 0;
        padding-left: 20px;
        color: rgb(var(--v-theme-ink-muted));
    }

    .dashboard-explainer strong {
        color: rgb(var(--v-theme-ink));
        font-weight: 600;
    }

    @media (max-width: 1279.98px) {
        .dashboard-columns {
            grid-template-columns: minmax(0, 1fr);
        }
    }
</style>
