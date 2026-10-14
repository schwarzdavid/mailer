<template>
    <VMain class="auth-layout">
        <div class="auth-layout__column">
            <AppLogo :size="40" wordmark class="auth-layout__logo" />
            <RouterView />
        </div>
        <footer class="auth-layout__footer">{{ t('app.copyright', { year }) }}</footer>
    </VMain>
</template>

<script setup lang="ts">
    import { useI18n } from 'vue-i18n'
    import AppLogo from '@/components/AppLogo.vue'

    const { t } = useI18n()
    const year = new Date().getFullYear()
</script>

<style scoped>
    .auth-layout {
        display: flex;
        flex-direction: column;
        min-height: 100dvh;
        background: rgb(var(--v-theme-background));
    }

    .auth-layout :deep(.v-main__scroller),
    .auth-layout :deep(> .v-main__wrap) {
        display: flex;
        flex-direction: column;
        flex: 1;
    }

    .auth-layout__column {
        display: grid;
        justify-items: center;
        gap: 24px;
        width: 100%;
        max-width: 420px;
        margin: 0 auto;
        padding: 64px 16px 32px;
        flex: 1;
        align-content: start;
    }

    .auth-layout__footer {
        padding: 0 16px 24px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
        text-align: center;
    }
</style>
