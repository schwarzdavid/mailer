<template>
    <SkeletonFrame :label="label">
        <div v-for="record in count" :key="record" class="dns-skeleton">
            <div class="dns-skeleton__head">
                <span class="dns-skeleton__lines">
                    <span class="bone bone--title" style="width: 80px" />
                    <span class="bone" style="width: 60%" />
                </span>
                <span class="bone bone--chip" />
            </div>
            <span class="bone bone--well" />
            <span class="bone bone--well" style="height: 52px" />
        </div>
    </SkeletonFrame>
</template>

<script setup lang="ts">
    import SkeletonFrame from '@/components/skeletons/SkeletonFrame.vue'

    withDefaults(defineProps<{ count?: number; label?: string }>(), { count: 3, label: undefined })
</script>

<style scoped>
    .dns-skeleton {
        display: grid;
        gap: 12px;
        padding: 20px 24px;
    }

    .dns-skeleton + .dns-skeleton {
        border-top: 1px solid rgb(var(--v-theme-border));
    }

    .dns-skeleton__head {
        display: flex;
        align-items: flex-start;
        gap: 12px;
    }

    .dns-skeleton__lines {
        flex: 1;
        display: grid;
        gap: 8px;
    }
</style>
