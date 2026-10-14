<template>
    <time :datetime="iso">
        {{ label }}
        <VTooltip v-if="withinDay" activator="parent" :text="dates.absolute(value)" />
    </time>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useNow } from '@vueuse/core'
    import { useDates } from '@/composables/useDates.ts'
    import { isWithinDay, toDate } from '@/helper/formatDate.ts'

    const props = defineProps<{ value: Date | string }>()

    const dates = useDates()
    const now = useNow({ interval: 30_000 })

    const iso = computed(() => toDate(props.value).toISOString())
    const withinDay = computed(() => isWithinDay(props.value, now.value))
    const label = computed(() =>
        withinDay.value ? dates.relative(props.value, now.value) : dates.absolute(props.value),
    )
</script>
