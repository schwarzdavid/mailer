<template>
    <div>
        <VAppBar class="px-2">
            Logo
            <VTabs>
                <VTab :to="{ name: RouteNames.DASHBOARD }" exact :text="t('module.dashboard.nav')" />
                <VTab :to="{ name: RouteNames.PROJECT_LIST }" :text="t('module.projects.nav')" />
                <VTab :to="{ name: RouteNames.DOMAIN_LIST }" :text="t('module.domains.nav')" />
                <VTab :to="{ name: RouteNames.BOUNCE_LIST }" :text="t('module.bounces.nav')" />
                <VTab :to="{ name: RouteNames.SETTINGS }">
                    {{ t('module.settings.nav') }}
                    <VIcon :icon="healthIcon" :color="healthColor" size="small" class="ms-1" />
                </VTab>
            </VTabs>
            <VSpacer />
            <VBtn variant="flat" :text="t('cta.logout')" @click="logout" />
        </VAppBar>
        <VMain>
            <RouterView />
        </VMain>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { RouteNames } from '@/router/RouteNames.ts'
    import { useI18n } from 'vue-i18n'
    import { useQuery, useQueryClient } from '@tanstack/vue-query'
    import { useLocalStorage } from '@vueuse/core'
    import { JWT_KEY } from '@/constants/jwtKey.ts'
    import { useRouter } from 'vue-router'
    import { useSettingsQuery } from '@/modules/settings/queries/useSettingsQuery.ts'

    const { t } = useI18n()
    const client = useQueryClient()
    const jwt = useLocalStorage<string | null>(JWT_KEY, null)
    const router = useRouter()

    const { data: settings } = useQuery({ ...useSettingsQuery(), refetchInterval: 60_000 })

    const isHealthy = computed(
        () =>
            !!settings.value?.sendingDomain &&
            settings.value.sendingDomain.records.every((record) => record.status === 'valid'),
    )
    const healthIcon = computed(() => (isHealthy.value ? 'mdi-check-circle' : 'mdi-alert-circle'))
    const healthColor = computed(() => (isHealthy.value ? 'success' : 'warning'))

    function logout() {
        jwt.value = null
        client.removeQueries()
        void router.push({ name: RouteNames.LOGIN })
    }
</script>
