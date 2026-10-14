<template>
    <span class="user-avatar" :class="{ 'user-avatar--sm': small }" aria-hidden="true">{{ initials }}</span>
</template>

<script setup lang="ts">
    import { computed } from 'vue'

    const props = withDefaults(defineProps<{ firstName: string; lastName: string; small?: boolean }>(), {
        small: false,
    })

    const initials = computed(() => `${props.firstName.charAt(0)}${props.lastName.charAt(0)}`.toUpperCase())
</script>

<style scoped>
    .user-avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 32px;
        height: 32px;
        border-radius: 9999px;
        background: rgb(var(--v-theme-primary-container));
        color: rgb(var(--v-theme-on-primary-container));
        font-size: 0.75rem;
        font-weight: 600;
        line-height: 1;
        letter-spacing: 0.02em;
    }

    .user-avatar--sm {
        width: 24px;
        height: 24px;
        font-size: 0.625rem;
    }
</style>
