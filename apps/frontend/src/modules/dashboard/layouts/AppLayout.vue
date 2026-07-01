<template>
    <div>
        <VAppBar class="px-2">
            Logo
            <VTabs>
                <VTab :to="{ name: RouteNames.DASHBOARD }" exact>Dashboard</VTab>
                <VTab :to="{name: RouteNames.DOMAIN_LIST}">Domains</VTab>
            </VTabs>
            <VSpacer />
            <VBtn variant="flat">Logout</VBtn>
        </VAppBar>
        <VMain>
            <RouterView />
        </VMain>
    </div>
</template>

<script setup lang="ts">
import { RouteNames } from '@/router/RouteNames.ts'
</script>
