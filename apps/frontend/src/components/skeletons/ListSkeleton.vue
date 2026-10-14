<template>
    <SkeletonFrame :label="label">
        <div v-for="row in rows" :key="row" class="list-skeleton__row">
            <span class="bone bone--disc" />
            <span class="list-skeleton__lines">
                <span class="bone" :style="{ width: `${40 + ((row * 17) % 30)}%` }" />
                <span class="bone" :style="{ width: `${25 + ((row * 11) % 20)}%` }" />
            </span>
            <span class="bone bone--chip" />
        </div>
    </SkeletonFrame>
</template>

<script setup lang="ts">
    import SkeletonFrame from '@/components/skeletons/SkeletonFrame.vue'

    withDefaults(defineProps<{ rows?: number; label?: string }>(), { rows: 3, label: undefined })
</script>

<style scoped>
    .list-skeleton__row {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 56px;
        padding: 8px 24px;
    }

    .list-skeleton__row + .list-skeleton__row {
        border-top: 1px solid rgb(var(--v-theme-border));
    }

    .list-skeleton__lines {
        flex: 1;
        display: grid;
        gap: 8px;
    }

    @media (max-width: 599.98px) {
        .list-skeleton__row {
            padding: 8px 16px;
        }
    }
</style>
