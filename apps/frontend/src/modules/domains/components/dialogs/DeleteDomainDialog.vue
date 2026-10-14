<template>
    <VDialog max-width="500" v-model="model" :persistent="isPending">
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard :title="t('module.domains.delete.title')">
            <VCardItem>
                <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
                <p>{{ t('module.domains.delete.confirm', { fqdn: domain.fqdn }) }}</p>
            </VCardItem>
            <VCardActions>
                <VSpacer />
                <VBtn :text="t('cta.abort')" :disabled="isPending" @click="model = false" />
                <VBtn color="error" variant="elevated" :text="t('cta.delete')" :loading="isPending" @click="onDelete" />
            </VCardActions>
        </VCard>
    </VDialog>
</template>

<script setup lang="ts">
    import { ref, watch } from 'vue'
    import type { DomainDto } from 'api'
    import { useI18n } from 'vue-i18n'
    import { useDomainDeleteMutation } from '@/modules/domains/mutations/useDomainDeleteMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const props = defineProps<{ domain: DomainDto }>()
    const model = ref<undefined | boolean>()
    const { t } = useI18n()
    const errorMessage = ref<string | null>(null)
    const { mutateAsync, isPending } = useDomainDeleteMutation()

    watch(model, (open) => {
        if (open) {
            errorMessage.value = null
        }
    })

    async function onDelete() {
        errorMessage.value = null
        try {
            await mutateAsync(props.domain.domainId)
            model.value = false
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.domains.delete.error'))
        }
    }
</script>
