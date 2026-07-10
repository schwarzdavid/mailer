<template>
    <VCard :title="t('module.inboundForms.details.security.title')">
        <template #append>
            <VBtn :text="t('module.inboundForms.details.security.add')" @click="openDialog(null)" />
        </template>
        <VCardItem>
            <p v-if="form.security.length === 0">{{ t('module.inboundForms.details.security.empty') }}</p>
            <VList v-else>
                <VListItem v-for="scheme in form.security" :key="scheme.inboundFormSecurityId">
                    <template #title>
                        {{ t(`module.inboundForms.details.security.typeOptions.${scheme.type}`) }}
                    </template>
                    <template #subtitle>
                        {{ t(`module.inboundForms.details.security.locationOptions.${scheme.location}`) }} ·
                        <code>{{ scheme.key }}</code>
                    </template>
                    <template #append>
                        <VIconBtn icon="mdi-pencil" size="small" @click="openDialog(scheme)" />
                        <VIconBtn icon="mdi-delete" size="small" @click="removeScheme(scheme.type)" />
                    </template>
                </VListItem>
            </VList>
        </VCardItem>
        <SecurityDialog v-model="dialogOpen" :scheme="editingScheme" :saving="isPending" @save="saveScheme" />
    </VCard>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormDetailDto, InboundFormSecurityDto, InboundFormSecurityUpsertDto } from 'api'
    import { useInboundFormSecurityMutation } from '@/modules/inbound-forms/mutations/useInboundFormSecurityMutation.ts'
    import SecurityDialog from '@/modules/inbound-forms/views/details/partials/SecurityDialog.vue'

    const props = defineProps<{ form: InboundFormDetailDto }>()

    const { t } = useI18n()
    const { mutateAsync, isPending } = useInboundFormSecurityMutation()

    const dialogOpen = ref(false)
    const editingScheme = ref<InboundFormSecurityDto | null>(null)

    function openDialog(scheme: InboundFormSecurityDto | null) {
        editingScheme.value = scheme
        dialogOpen.value = true
    }

    function toUpsert(scheme: InboundFormSecurityDto): InboundFormSecurityUpsertDto {
        return {
            type: scheme.type,
            location: scheme.location,
            key: scheme.key,
            config: scheme.config ?? null,
        }
    }

    async function saveScheme(payload: InboundFormSecurityUpsertDto) {
        const others = props.form.security.filter((scheme) => scheme.type !== payload.type).map(toUpsert)

        await mutateAsync({ inboundFormId: props.form.inboundFormId, security: [...others, payload] })
        dialogOpen.value = false
    }

    async function removeScheme(type: InboundFormSecurityDto['type']) {
        const security = props.form.security.filter((scheme) => scheme.type !== type).map(toUpsert)

        await mutateAsync({ inboundFormId: props.form.inboundFormId, security })
    }
</script>
