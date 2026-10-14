<template>
    <SkeletonFrame :label="label">
        <div class="editor-skeleton">
            <span class="bone bone--field" />
            <div class="editor-skeleton__panes">
                <div class="editor-skeleton__pane">
                    <span
                        v-for="line in 12"
                        :key="line"
                        class="bone"
                        :style="{ width: `${30 + ((line * 23) % 60)}%` }"
                    />
                </div>
                <div class="editor-skeleton__pane">
                    <span class="bone" style="width: 40%" />
                    <span class="bone" style="width: 60%" />
                    <span class="bone editor-skeleton__canvas" />
                </div>
            </div>
        </div>
    </SkeletonFrame>
</template>

<script setup lang="ts">
    import SkeletonFrame from '@/components/skeletons/SkeletonFrame.vue'

    withDefaults(defineProps<{ label?: string }>(), { label: undefined })
</script>

<style scoped>
    .editor-skeleton {
        display: grid;
        gap: 16px;
    }

    .editor-skeleton__panes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
    }

    .editor-skeleton__pane {
        display: grid;
        align-content: start;
        gap: 10px;
        min-height: 360px;
        padding: 16px;
        border: 1px solid rgb(var(--v-theme-border));
        border-radius: 10px;
        background: rgb(var(--v-theme-surface));
    }

    .editor-skeleton__canvas {
        height: 240px;
    }
</style>
