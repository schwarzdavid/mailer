<template>
    <SkeletonFrame :label="label">
        <div class="page-skeleton">
            <div v-for="card in cards" :key="card" class="page-skeleton__card">
                <span class="bone bone--title" style="width: 30%" />
                <span class="bone" style="width: 55%" />
                <span class="bone bone--field" />
                <span class="bone bone--field" />
                <span class="bone bone--btn page-skeleton__btn" />
            </div>
        </div>
    </SkeletonFrame>
</template>

<script setup lang="ts">
    import SkeletonFrame from '@/components/skeletons/SkeletonFrame.vue'

    withDefaults(defineProps<{ cards?: number; label?: string }>(), { cards: 1, label: undefined })
</script>

<style scoped>
    .page-skeleton {
        display: grid;
        gap: 24px;
    }

    .page-skeleton__card {
        display: grid;
        gap: 16px;
        padding: 24px;
        border: 1px solid rgb(var(--v-theme-border));
        border-radius: 10px;
        background: rgb(var(--v-theme-surface));
    }

    .page-skeleton__btn {
        justify-self: end;
    }
</style>
