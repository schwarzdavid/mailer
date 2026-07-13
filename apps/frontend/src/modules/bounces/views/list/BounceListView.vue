<template>
    <VContainer>
        <h1>{{ t('module.bounces.title') }}</h1>
        <VTabs v-model="tab">
            <VTab value="bounces" :text="t('module.bounces.tabs.bounces')" />
            <VTab value="blocked" :text="t('module.bounces.tabs.blocked')" />
        </VTabs>
        <VDivider />
        <VTabsWindow v-model="tab">
            <VTabsWindowItem value="bounces">
                <BounceTable />
            </VTabsWindowItem>
            <VTabsWindowItem value="blocked">
                <BlockedTable />
            </VTabsWindowItem>
        </VTabsWindow>
    </VContainer>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import BounceTable from '@/modules/bounces/views/list/partials/BounceTable.vue'
    import BlockedTable from '@/modules/bounces/views/list/partials/BlockedTable.vue'

    const { t } = useI18n()
    const tab = ref('bounces')
</script>
