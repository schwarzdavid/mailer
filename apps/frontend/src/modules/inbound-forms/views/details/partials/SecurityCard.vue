<template>
    <SectionCard
        :title="t('module.inboundForms.details.security.title')"
        :description="t('module.inboundForms.details.security.description')"
        :count="visibleChecks.length || undefined"
        flush
    >
        <template v-if="canUpdate" #actions>
            <VBtn
                size="small"
                :prepend-icon="mdiPlus"
                :text="t('module.inboundForms.details.security.add')"
                @click="openDialog(null)"
            />
        </template>
        <EmptyState
            v-if="visibleChecks.length === 0"
            :icon="mdiShieldOutline"
            :title="t('module.inboundForms.details.security.empty.title')"
            :text="t('module.inboundForms.details.security.empty.text')"
        />
        <ListRow
            v-for="check in visibleChecks"
            :key="check.inboundFormSecurityId"
            :icon="mdiShieldCheckOutline"
            :title="t(`module.inboundForms.details.security.typeOptions.${check.type}`)"
        >
            <template #subtitle>
                {{ t(`module.inboundForms.details.security.locationOptions.${check.location}`) }}
                <span class="row-sep">·</span>
                <span class="mono">{{ check.key }}</span>
                <template v-if="check.config?.minScore !== undefined">
                    <span class="row-sep">·</span>
                    {{ t('module.inboundForms.details.security.minScoreShort', { score: n(check.config.minScore) }) }}
                </template>
            </template>
            <template v-if="canUpdate" #actions>
                <IconButton
                    :icon="mdiPencilOutline"
                    :label="t('module.inboundForms.details.security.editLabel', { type: typeLabel(check) })"
                    small
                    @click="openDialog(check)"
                />
                <IconButton
                    :icon="mdiDeleteOutline"
                    :label="t('module.inboundForms.details.security.removeLabel', { type: typeLabel(check) })"
                    small
                    danger
                    @click="removeCheck(check)"
                />
            </template>
        </ListRow>
    </SectionCard>
    <SecurityDialog
        v-if="canUpdate"
        v-model="dialogOpen"
        :scheme="editingScheme"
        :taken-types="visibleChecks.map((check) => check.type)"
        :saving="isPending"
        :error="dialogError"
        @save="saveScheme"
    />
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { mdiDeleteOutline, mdiPencilOutline, mdiPlus, mdiShieldCheckOutline, mdiShieldOutline } from '@mdi/js'
    import type { InboundFormDetailDto, InboundFormSecurityDto, InboundFormSecurityUpsertDto } from 'api'
    import EmptyState from '@/components/EmptyState.vue'
    import IconButton from '@/components/IconButton.vue'
    import ListRow from '@/components/ListRow.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useUndoRemove } from '@/composables/useUndoRemove.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useInboundFormSecurityMutation } from '@/modules/inbound-forms/mutations/useInboundFormSecurityMutation.ts'
    import SecurityDialog from '@/modules/inbound-forms/views/details/partials/SecurityDialog.vue'

    const props = defineProps<{ form: InboundFormDetailDto; canUpdate: boolean }>()

    const { t, n } = useI18n()
    const notify = useNotify()
    const { mutateAsync, isPending } = useInboundFormSecurityMutation()
    const { remove, isHidden } = useUndoRemove<InboundFormSecurityDto['type']>()

    const dialogOpen = ref(false)
    const editingScheme = ref<InboundFormSecurityDto | null>(null)
    const dialogError = ref<string | null>(null)

    const visibleChecks = computed(() => props.form.security.filter((check) => !isHidden(check.type)))

    function typeLabel(check: InboundFormSecurityDto) {
        return t(`module.inboundForms.details.security.typeOptions.${check.type}`)
    }

    function openDialog(scheme: InboundFormSecurityDto | null) {
        editingScheme.value = scheme
        dialogError.value = null
        dialogOpen.value = true
    }

    function toUpsert(scheme: InboundFormSecurityDto): InboundFormSecurityUpsertDto {
        return {
            type: scheme.type,
            location: scheme.location,
            key: scheme.key,
            config: scheme.config ? { minScore: scheme.config.minScore } : null,
        }
    }

    async function saveScheme(payload: InboundFormSecurityUpsertDto) {
        const others = visibleChecks.value.filter((scheme) => scheme.type !== payload.type).map(toUpsert)

        dialogError.value = null
        try {
            await mutateAsync({ inboundFormId: props.form.inboundFormId, security: [...others, payload] })
            dialogOpen.value = false
            notify.success(t('module.inboundForms.details.security.saved'))
        } catch (error) {
            dialogError.value = apiErrorMessage(error, t('dialog.tryAgain'))
        }
    }

    function removeCheck(check: InboundFormSecurityDto) {
        remove(check.type, {
            text: t('module.inboundForms.details.security.removed', { type: typeLabel(check) }),
            errorText: t('module.inboundForms.details.security.removeError', { type: typeLabel(check) }),
            commit: () =>
                mutateAsync({
                    inboundFormId: props.form.inboundFormId,
                    security: props.form.security
                        .filter((candidate) => candidate.type !== check.type && !isHidden(candidate.type))
                        .map(toUpsert),
                }),
        })
    }
</script>
