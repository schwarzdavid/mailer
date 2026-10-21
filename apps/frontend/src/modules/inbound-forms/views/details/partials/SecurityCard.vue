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
        <div class="hostnames">
            <div class="hostnames__head">
                <div class="hostnames__title">{{ t('module.inboundForms.details.security.hostnames.title') }}</div>
                <IconButton
                    v-if="canUpdate"
                    :icon="mdiPencilOutline"
                    :label="t('module.inboundForms.details.security.hostnames.editLabel')"
                    small
                    @click="openHostnamesDialog"
                />
            </div>
            <div v-if="form.allowedHostnames.length > 0" class="hostnames__chips">
                <TagLabel v-for="hostname in form.allowedHostnames" :key="hostname" :label="hostname" mono />
            </div>
            <InlineAlert
                v-else
                tone="warning"
                :text="t('module.inboundForms.details.security.hostnames.emptyWarning')"
            />
        </div>
        <EmptyState
            v-if="visibleChecks.length === 0"
            :icon="mdiShieldOutline"
            :title="t('module.inboundForms.details.security.empty.title')"
            :text="t('module.inboundForms.details.security.empty.text')"
        />
        <VExpandTransition group>
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
                        {{
                            t('module.inboundForms.details.security.minScoreShort', { score: n(check.config.minScore) })
                        }}
                    </template>
                    <template v-if="check.config?.expectedAction">
                        <span class="row-sep">·</span>
                        {{
                            t('module.inboundForms.details.security.expectedActionShort', {
                                action: check.config.expectedAction,
                            })
                        }}
                    </template>
                    <template v-if="check.config?.minDelaySeconds !== undefined">
                        <span class="row-sep">·</span>
                        {{
                            t('module.inboundForms.details.security.minDelayShort', {
                                seconds: n(check.config.minDelaySeconds),
                            })
                        }}
                    </template>
                    <template v-if="check.config?.maxAgeSeconds !== undefined">
                        <span class="row-sep">·</span>
                        {{
                            t('module.inboundForms.details.security.maxAgeShort', {
                                seconds: n(check.config.maxAgeSeconds),
                            })
                        }}
                    </template>
                </template>
                <template #actions>
                    <IconButton
                        :icon="mdiInformationOutline"
                        :label="t('module.inboundForms.details.security.info.label', { type: typeLabel(check) })"
                        small
                        @click="openInfo(check)"
                    />
                    <IconButton
                        v-if="canUpdate"
                        :icon="mdiPencilOutline"
                        :label="t('module.inboundForms.details.security.editLabel', { type: typeLabel(check) })"
                        small
                        @click="openDialog(check)"
                    />
                    <IconButton
                        v-if="canUpdate"
                        :icon="mdiDeleteOutline"
                        :label="t('module.inboundForms.details.security.removeLabel', { type: typeLabel(check) })"
                        small
                        danger
                        @click="removeCheck(check)"
                    />
                </template>
            </ListRow>
        </VExpandTransition>
    </SectionCard>
    <SecurityInfoDialog v-model="infoOpen" :scheme="infoScheme" :form="form" />
    <SecurityDialog
        v-if="canUpdate"
        v-model="dialogOpen"
        :scheme="editingScheme"
        :taken-types="visibleChecks.map((check) => check.type)"
        :has-hostnames="form.allowedHostnames.length > 0"
        :saving="isPending"
        :error="dialogError"
        @save="saveScheme"
    />
    <AllowedHostnamesDialog
        v-if="canUpdate"
        v-model="hostnamesDialogOpen"
        :hostnames="form.allowedHostnames"
        :saving="isUpdatingHostnames"
        :error="hostnamesError"
        @save="saveHostnames"
    />
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import {
        mdiDeleteOutline,
        mdiInformationOutline,
        mdiPencilOutline,
        mdiPlus,
        mdiShieldCheckOutline,
        mdiShieldOutline,
    } from '@mdi/js'
    import type { InboundFormDetailDto, InboundFormSecurityDto, InboundFormSecurityUpsertDto } from 'api'
    import EmptyState from '@/components/EmptyState.vue'
    import IconButton from '@/components/IconButton.vue'
    import InlineAlert from '@/components/InlineAlert.vue'
    import ListRow from '@/components/ListRow.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import TagLabel from '@/components/TagLabel.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useUndoRemove } from '@/composables/useUndoRemove.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useInboundFormSecurityMutation } from '@/modules/inbound-forms/mutations/useInboundFormSecurityMutation.ts'
    import { useInboundFormUpdateMutation } from '@/modules/inbound-forms/mutations/useInboundFormUpdateMutation.ts'
    import AllowedHostnamesDialog from '@/modules/inbound-forms/views/details/partials/AllowedHostnamesDialog.vue'
    import SecurityDialog from '@/modules/inbound-forms/views/details/partials/SecurityDialog.vue'
    import SecurityInfoDialog from '@/modules/inbound-forms/views/details/partials/SecurityInfoDialog.vue'

    const props = defineProps<{ form: InboundFormDetailDto; canUpdate: boolean }>()

    const { t, n } = useI18n()
    const notify = useNotify()
    const { mutateAsync, isPending } = useInboundFormSecurityMutation()
    const { mutateAsync: updateForm, isPending: isUpdatingHostnames } = useInboundFormUpdateMutation()
    const { remove, isHidden } = useUndoRemove<InboundFormSecurityDto['type']>()

    const dialogOpen = ref(false)
    const editingScheme = ref<InboundFormSecurityDto | null>(null)
    const dialogError = ref<string | null>(null)

    const infoOpen = ref(false)
    const infoScheme = ref<InboundFormSecurityDto | null>(null)

    const hostnamesDialogOpen = ref(false)
    const hostnamesError = ref<string | null>(null)

    const visibleChecks = computed(() => props.form.security.filter((check) => !isHidden(check.type)))

    function typeLabel(check: InboundFormSecurityDto) {
        return t(`module.inboundForms.details.security.typeOptions.${check.type}`)
    }

    function openHostnamesDialog() {
        hostnamesError.value = null
        hostnamesDialogOpen.value = true
    }

    async function saveHostnames(allowedHostnames: string[]) {
        hostnamesError.value = null
        try {
            await updateForm({ inboundFormId: props.form.inboundFormId, update: { allowedHostnames } })
            hostnamesDialogOpen.value = false
            notify.success(t('module.inboundForms.details.security.hostnames.saved'))
        } catch (error) {
            hostnamesError.value = apiErrorMessage(error, t('dialog.tryAgain'))
        }
    }

    function openInfo(scheme: InboundFormSecurityDto) {
        infoScheme.value = scheme
        infoOpen.value = true
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
            config: scheme.config
                ? {
                      minScore: scheme.config.minScore,
                      expectedAction: scheme.config.expectedAction,
                      minDelaySeconds: scheme.config.minDelaySeconds,
                      maxAgeSeconds: scheme.config.maxAgeSeconds,
                  }
                : null,
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

<style scoped>
    .hostnames {
        display: grid;
        gap: 8px;
        padding: 16px 20px;
        border-bottom: 1px solid rgb(var(--v-theme-border));
    }

    .hostnames__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 28px;
    }

    .hostnames__title {
        font-size: 0.875rem;
        font-weight: 600;
    }

    .hostnames__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
</style>
