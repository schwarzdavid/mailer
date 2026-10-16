<template>
    <nav class="app-nav" :class="{ 'app-nav--rail': rail }" :aria-label="t('nav.main')">
        <div class="app-nav__brand">
            <RouterLink :to="{ name: RouteNames.DASHBOARD }" class="app-nav__brand-link" :aria-label="t('app.name')">
                <AppLogo :wordmark="!rail" />
            </RouterLink>
            <IconButton v-if="closable" :icon="mdiClose" :label="t('nav.close')" @click="emit('close')" />
        </div>
        <div class="app-nav__section">
            <NavItem v-for="item in primaryItems" :key="item.section" :item="item" :rail="rail" />
        </div>
        <template v-if="adminItems.length">
            <div v-if="!rail" class="app-nav__label">{{ t('nav.administration') }}</div>
            <div v-else class="app-nav__divider" />
            <div class="app-nav__section">
                <NavItem v-for="item in adminItems" :key="item.section" :item="item" :rail="rail" />
            </div>
        </template>
        <div class="app-nav__spacer" />
        <AccountMenu :rail="rail" />
    </nav>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import {
        mdiAccountMultipleOutline,
        mdiClose,
        mdiCogOutline,
        mdiEmailAlertOutline,
        mdiFolderOutline,
        mdiShieldAccountOutline,
        mdiViewDashboardOutline,
        mdiWeb,
    } from '@mdi/js'
    import AppLogo from '@/components/AppLogo.vue'
    import IconButton from '@/components/IconButton.vue'
    import AccountMenu from '@/modules/dashboard/layouts/partials/AccountMenu.vue'
    import NavItem from '@/modules/dashboard/layouts/partials/NavItem.vue'
    import type { NavigationItem } from '@/modules/dashboard/layouts/partials/navigationItem.ts'
    import { useSendingDomainHealth } from '@/modules/settings/composables/useSendingDomainHealth.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    withDefaults(defineProps<{ rail?: boolean; closable?: boolean }>(), { rail: false, closable: false })
    const emit = defineEmits<{ close: [] }>()

    const { t } = useI18n()
    const userAbility = useAbility()
    const health = useSendingDomainHealth()

    const healthHint = computed(() =>
        health.needsAttention.value
            ? health.configured.value
                ? t('nav.health.records', { count: health.invalidCount.value }, health.invalidCount.value)
                : t('nav.health.unconfigured')
            : undefined,
    )

    const items = computed<(NavigationItem & { group: 'primary' | 'admin'; can: boolean })[]>(() => [
        {
            group: 'primary',
            section: 'dashboard',
            title: t('nav.dashboard'),
            icon: mdiViewDashboardOutline,
            to: { name: RouteNames.DASHBOARD },
            can: true,
        },
        {
            group: 'primary',
            section: 'projects',
            title: t('nav.projects'),
            icon: mdiFolderOutline,
            to: { name: RouteNames.PROJECT_LIST },
            can: true,
        },
        {
            group: 'primary',
            section: 'domains',
            title: t('nav.domains'),
            icon: mdiWeb,
            to: { name: RouteNames.DOMAIN_LIST },
            can: userAbility.can('read', 'Domain'),
        },
        {
            group: 'primary',
            section: 'bounces',
            title: t('nav.bounces'),
            icon: mdiEmailAlertOutline,
            to: { name: RouteNames.BOUNCE_LIST },
            can: userAbility.can('read', 'Bounce'),
        },
        {
            group: 'admin',
            section: 'users',
            title: t('nav.users'),
            icon: mdiAccountMultipleOutline,
            to: { name: RouteNames.USER_LIST },
            can: userAbility.can('read', 'User'),
        },
        {
            group: 'admin',
            section: 'roles',
            title: t('nav.roles'),
            icon: mdiShieldAccountOutline,
            to: { name: RouteNames.ROLE_LIST },
            can: userAbility.can('read', 'Role'),
        },
        {
            group: 'admin',
            section: 'settings',
            title: t('nav.settings'),
            icon: mdiCogOutline,
            to: { name: RouteNames.SETTINGS },
            can: userAbility.can('read', 'Settings'),
            attention: healthHint.value,
        },
    ])

    const primaryItems = computed(() => items.value.filter((item) => item.can && item.group === 'primary'))
    const adminItems = computed(() => items.value.filter((item) => item.can && item.group === 'admin'))
</script>

<style scoped>
    .app-nav {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: rgb(var(--v-theme-surface));
    }

    .app-nav__brand {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        height: 64px;
        padding: 0 12px 0 20px;
        flex: none;
    }

    .app-nav__brand-link {
        display: inline-flex;
        border-radius: 6px;
        text-decoration: none;
    }

    .app-nav__section {
        display: grid;
        gap: 2px;
        padding: 8px 12px;
    }

    .app-nav__label {
        padding: 16px 24px 4px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.6875rem;
        font-weight: 600;
        line-height: 1rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .app-nav__divider {
        height: 1px;
        margin: 8px 12px;
        background: rgb(var(--v-theme-border));
    }

    .app-nav__spacer {
        flex: 1;
    }

    .app-nav--rail .app-nav__brand {
        justify-content: center;
        padding: 0;
    }
</style>
