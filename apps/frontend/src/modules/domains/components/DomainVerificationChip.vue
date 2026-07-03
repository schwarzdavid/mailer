<template>
    <VChip
        color="success"
        prepend-icon="mdi-check"
        :text="t('module.domains.status.valid')"
        v-if="isValid"
        variant="elevated"
    />
    <VChip
        color="warning"
        prepend-icon="mdi-alert"
        :text="t('module.domains.status.invalid')"
        v-else
        variant="elevated"
    />
</template>

<script lang="ts" setup>
    import type { DomainDto } from 'api'
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'

    const props = defineProps<{
        domain: DomainDto
    }>()

    const { t } = useI18n()

    const isValid = computed(() => Object.values(props.domain.dns).every((dns) => dns.status === 'valid'))
</script>
