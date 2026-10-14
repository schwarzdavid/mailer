<template>
    <VApp>
        <RouterView />
        <ConfirmDialogHost />
        <NotificationHost />
    </VApp>
</template>

<script setup lang="ts">
    import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
    import NotificationHost from '@/components/NotificationHost.vue'
    import { useThemePreference } from '@/composables/useThemePreference.ts'

    useThemePreference()
</script>
