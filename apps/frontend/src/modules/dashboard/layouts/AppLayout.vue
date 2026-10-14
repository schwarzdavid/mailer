<template>
    <VAppBar v-if="xs" class="app-bar" height="56" flat>
        <span class="app-bar__menu">
            <IconButton :icon="mdiMenu" :label="t('nav.open')" @click="drawer = true" />
            <StatusDot v-if="health.needsAttention.value" tone="warning" class="app-bar__dot" />
        </span>
        <RouterLink :to="{ name: RouteNames.DASHBOARD }" class="app-bar__brand">
            <AppLogo wordmark />
        </RouterLink>
        <VSpacer />
        <AccountMenu avatar-only />
    </VAppBar>
    <VNavigationDrawer
        v-model="drawer"
        :permanent="!xs"
        :temporary="xs"
        :rail="rail"
        :width="xs ? 280 : 248"
        :rail-width="72"
        class="app-drawer"
    >
        <AppNavigation :rail="rail" :closable="xs" @close="drawer = false" />
    </VNavigationDrawer>
    <VMain class="app-main">
        <div class="app-main__content" :class="{ 'app-main__content--wide': route.meta.wide }">
            <ErrorState v-if="forbidden" kind="forbidden" size="page" :permission="forbiddenPermission">
                <template #actions>
                    <VBtn variant="text" :to="{ name: RouteNames.DASHBOARD }" :text="t('nav.backToDashboard')" />
                </template>
            </ErrorState>
            <RouterView v-else v-slot="{ Component }">
                <VFadeTransition mode="out-in">
                    <div :key="viewKey(Component)" class="app-view">
                        <component :is="Component" />
                    </div>
                </VFadeTransition>
            </RouterView>
        </div>
    </VMain>
</template>

<script setup lang="ts">
    import { computed, ref, watch, type VNode } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useRoute } from 'vue-router'
    import { useDisplay } from 'vuetify'
    import { useAbility } from '@casl/vue'
    import { mdiMenu } from '@mdi/js'
    import AppLogo from '@/components/AppLogo.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import IconButton from '@/components/IconButton.vue'
    import StatusDot from '@/components/StatusDot.vue'
    import AccountMenu from '@/modules/dashboard/layouts/partials/AccountMenu.vue'
    import AppNavigation from '@/modules/dashboard/layouts/partials/AppNavigation.vue'
    import { useSendingDomainHealth } from '@/modules/settings/composables/useSendingDomainHealth.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
    const route = useRoute()
    const { xs, mdAndUp } = useDisplay()
    const userAbility = useAbility()
    const health = useSendingDomainHealth()

    const drawer = ref(!xs.value)
    const rail = computed(() => !xs.value && (!mdAndUp.value || !!route.meta.rail))

    const forbidden = computed(() => {
        const required = route.meta.ability
        return !!required && !userAbility.can(required.action, required.subject)
    })
    const forbiddenPermission = computed(() => {
        const required = route.meta.ability
        return required ? t(`nav.permission.${required.subject}`) : undefined
    })

    const viewKeys = new WeakMap<object, number>()
    let nextViewKey = 1
    function viewKey(view: VNode | undefined) {
        if (!view || typeof view.type !== 'object') {
            return 0
        }
        if (!viewKeys.has(view.type)) {
            viewKeys.set(view.type, nextViewKey++)
        }
        return viewKeys.get(view.type)
    }

    watch(xs, (isPhone) => {
        drawer.value = !isPhone
    })

    watch(
        () => route.fullPath,
        () => {
            if (xs.value) {
                drawer.value = false
            }
        },
    )
</script>

<style scoped>
    .app-bar {
        border-bottom: 1px solid rgb(var(--v-theme-border));
        background: rgb(var(--v-theme-surface)) !important;
    }

    .app-bar :deep(.v-toolbar__content) {
        gap: 4px;
        padding: 0 8px;
    }

    .app-bar__menu {
        position: relative;
        display: inline-flex;
    }

    .app-bar__dot {
        position: absolute;
        top: 8px;
        right: 8px;
        box-shadow: 0 0 0 2px rgb(var(--v-theme-surface));
        pointer-events: none;
    }

    .app-bar__brand {
        display: inline-flex;
        text-decoration: none;
    }

    .app-drawer {
        background: rgb(var(--v-theme-surface));
        border-color: rgb(var(--v-theme-border)) !important;
    }

    .app-main {
        background: rgb(var(--v-theme-background));
    }

    .app-main__content {
        width: 100%;
        max-width: calc(1120px + 64px);
        margin: 0 auto;
        padding: 32px;
    }

    .app-main__content--wide {
        max-width: none;
        padding: 24px 32px;
    }

    @media (max-width: 599.98px) {
        .app-main__content,
        .app-main__content--wide {
            padding: 16px;
        }
    }
</style>
