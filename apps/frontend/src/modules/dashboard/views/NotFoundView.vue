<template>
    <PageHeader :title="t('module.notFound.title')" />
    <ErrorState kind="notFound" size="page" :thing="t('module.notFound.thing')">
        <template #actions>
            <VBtn :to="{ name: RouteNames.DASHBOARD }" :text="t('nav.backToDashboard')" />
        </template>
    </ErrorState>
</template>

<script setup lang="ts">
    import { useI18n } from 'vue-i18n'
    import ErrorState from '@/components/ErrorState.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const { t } = useI18n()
</script>
