<template>
    <div v-if="range.total > 0" class="table-footer">
        <span class="tabular-nums">
            {{ t('pager.range', { from: n(range.from), to: n(range.to), total: n(range.total) }) }}
        </span>
        <IconButton
            :icon="mdiChevronLeft"
            :label="t('pager.previous')"
            small
            :disabled="page <= 1"
            @click="emit('update:page', page - 1)"
        />
        <IconButton
            :icon="mdiChevronRight"
            :label="t('pager.next')"
            small
            :disabled="range.to >= range.total"
            @click="emit('update:page', page + 1)"
        />
    </div>
</template>

<script setup lang="ts">
    import { useI18n } from 'vue-i18n'
    import { mdiChevronLeft, mdiChevronRight } from '@mdi/js'
    import IconButton from '@/components/IconButton.vue'
    import type { PageRange } from '@/composables/usePagedServerTable.ts'

    defineProps<{ page: number; range: PageRange }>()

    const emit = defineEmits<{ 'update:page': [page: number] }>()
    const { t, n } = useI18n()
</script>
