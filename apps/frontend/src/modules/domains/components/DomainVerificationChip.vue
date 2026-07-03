<template>
    <VChip color="success" prepend-icon="mdi-check" text="Valid" v-if="isValid" variant="elevated" />
    <VChip color="warning" prepend-icon="mdi-alert" text="Invalid" v-else variant="elevated" />
</template>

<script lang="ts" setup>
    import type { DomainDto } from 'api'
    import { computed } from 'vue'

    const props = defineProps<{
            domain: DomainDto
        }>()

    const isValid = computed(() => Object.values(props.domain.dns).every((dns) => dns.status === 'valid'))
</script>
