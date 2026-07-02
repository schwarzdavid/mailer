<template>
    <div>
        <VAppBar class="px-2">
            Logo
            <VTabs>
                <VTab :to="{ name: RouteNames.DASHBOARD }" exact>Dashboard</VTab>
                <VTab :to="{ name: RouteNames.DOMAIN_LIST }">Domains</VTab>
            </VTabs>
            <VSpacer />
            <VBtn variant="flat" :text="t('cta.logout')" @click="logout"/>
        </VAppBar>
        <VMain>
            <RouterView />
        </VMain>
    </div>
</template>

<script setup lang="ts">
    import { RouteNames } from '@/router/RouteNames.ts'
    import { useI18n } from 'vue-i18n'
    import { useQueryClient } from '@tanstack/vue-query'
    import { useLocalStorage } from '@vueuse/core'
    import { JWT_KEY } from '@/constants/jwtKey.ts'
    import { useRouter } from 'vue-router'

    const {t} = useI18n()
    const client = useQueryClient()
    const jwt = useLocalStorage<string | null>(JWT_KEY, null)
    const router = useRouter()

    function logout() {
        jwt.value = null
        client.removeQueries()
        void router.push({ name: RouteNames.LOGIN })
    }
</script>

<i18n>
{
    "en": {
        "cta": {
            "logout": "Logout"
        }
    }
}
</i18n>
