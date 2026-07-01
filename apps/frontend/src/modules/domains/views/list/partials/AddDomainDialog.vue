<template>
    <VDialog max-width="600" v-model="model">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard title="Add Domain">
            <template #append>
                <VIconBtn icon="mdi-close" @click="model = false" />
            </template>
        </VCard>
    </VDialog>
</template>

<script lang="ts" setup>
    import { ref } from 'vue'

    const model = ref<undefined | boolean>()
</script>
