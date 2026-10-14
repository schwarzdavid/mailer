<template>
    <SkeletonFrame :label="label">
        <div v-for="row in rows" :key="row" class="table-skeleton__row">
            <span
                v-for="column in columns"
                :key="column"
                class="bone"
                :style="{ flex: column === 1 ? 2 : 1, maxWidth: `${50 + ((row * column * 13) % 50)}%` }"
            />
        </div>
    </SkeletonFrame>
</template>

<script setup lang="ts">
    import SkeletonFrame from '@/components/skeletons/SkeletonFrame.vue'

    withDefaults(defineProps<{ columns?: number; rows?: number; label?: string }>(), {
        columns: 4,
        rows: 5,
        label: undefined,
    })
</script>

<style scoped>
    .table-skeleton__row {
        display: flex;
        align-items: center;
        gap: 32px;
        min-height: 45px;
        padding: 12px 24px;
    }

    .table-skeleton__row + .table-skeleton__row {
        border-top: 1px solid rgb(var(--v-theme-border));
    }
</style>
