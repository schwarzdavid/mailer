<template>
    <SectionCard
        :title="t('module.inboundForms.details.receivers.title')"
        :description="t('module.inboundForms.details.receivers.description')"
        :count="visibleReceivers.length || undefined"
        flush
    >
        <template v-if="canUpdate" #actions>
            <VBtn
                size="small"
                :prepend-icon="mdiPlus"
                :text="t('module.inboundForms.details.receivers.add')"
                @click="openDialog(null)"
            />
        </template>
        <EmptyState
            v-if="visibleReceivers.length === 0"
            :icon="mdiEmailArrowRightOutline"
            :title="t('module.inboundForms.details.receivers.empty.title')"
            :text="t('module.inboundForms.details.receivers.empty.text')"
        />
        <ListRow
            v-for="receiver in visibleReceivers"
            :key="receiver.inboundFormReceiverId"
            :icon="mdiEmailArrowRightOutline"
            :pending="togglingId === receiver.inboundFormReceiverId"
        >
            <template #title>
                <span class="mono receivers-card__route">{{ receiver.emailFrom }} → {{ receiver.emailReceiver }}</span>
            </template>
            <template #subtitle>
                <template v-if="receiver.emailReplyTo">
                    {{ t('module.inboundForms.details.receivers.replyTo') }}
                    <span class="mono">{{ receiver.emailReplyTo }}</span>
                </template>
                <template v-else>{{ t('module.inboundForms.details.receivers.noReplyTo') }}</template>
            </template>
            <template #meta>
                <StatusBadge v-bind="templateBadge(receiver)" />
                <StatusBadge v-bind="activityBadge(receiver.isActive)" />
            </template>
            <template #actions>
                <VBtn
                    v-if="!xs"
                    size="small"
                    variant="text"
                    :prepend-icon="mdiCodeTags"
                    :text="templateAction(receiver)"
                    :to="templateRoute(receiver)"
                />
                <VMenu v-if="canUpdate || xs">
                    <template #activator="{ props: activator }">
                        <IconButton
                            v-bind="activator"
                            :icon="mdiDotsVertical"
                            :label="
                                t('module.inboundForms.details.receivers.actions', { email: receiver.emailReceiver })
                            "
                            small
                        />
                    </template>
                    <VList density="compact">
                        <VListItem
                            v-if="xs"
                            :prepend-icon="mdiCodeTags"
                            :title="templateAction(receiver)"
                            :to="templateRoute(receiver)"
                        />
                        <template v-if="canUpdate">
                            <VListItem
                                :prepend-icon="mdiPencilOutline"
                                :title="t('module.inboundForms.details.receivers.edit')"
                                @click="openDialog(receiver)"
                            />
                            <VListItem
                                :prepend-icon="receiver.isActive ? mdiPauseCircleOutline : mdiPlayCircleOutline"
                                :title="
                                    receiver.isActive
                                        ? t('module.inboundForms.details.receivers.deactivate')
                                        : t('module.inboundForms.details.receivers.activate')
                                "
                                @click="toggleActive(receiver)"
                            />
                            <VListItem
                                class="text-error"
                                :prepend-icon="mdiDeleteOutline"
                                :title="t('module.inboundForms.details.receivers.remove')"
                                @click="removeReceiver(receiver)"
                            />
                        </template>
                    </VList>
                </VMenu>
            </template>
        </ListRow>
    </SectionCard>
    <ReceiverDialog
        v-if="canUpdate"
        v-model="dialogOpen"
        :receiver="editingReceiver"
        :email-fields="emailFields"
        :domain-fqdn="senderDomain"
        :saving="isSaving"
        :error="dialogError"
        @save="saveReceiver"
    />
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useDisplay } from 'vuetify'
    import {
        mdiCodeTags,
        mdiDeleteOutline,
        mdiDotsVertical,
        mdiEmailArrowRightOutline,
        mdiPauseCircleOutline,
        mdiPencilOutline,
        mdiPlayCircleOutline,
        mdiPlus,
    } from '@mdi/js'
    import type { InboundFormDetailDto, InboundFormReceiverCreateDto, InboundFormReceiverDto } from 'api'
    import EmptyState from '@/components/EmptyState.vue'
    import IconButton from '@/components/IconButton.vue'
    import ListRow from '@/components/ListRow.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import { useConfirm } from '@/composables/useConfirm.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useUndoRemove } from '@/composables/useUndoRemove.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useReceiverStatus } from '@/modules/inbound-forms/helpers/receiverStatus.ts'
    import { useReceiverCreateMutation } from '@/modules/inbound-forms/mutations/useReceiverCreateMutation.ts'
    import { useReceiverDeleteMutation } from '@/modules/inbound-forms/mutations/useReceiverDeleteMutation.ts'
    import { useReceiverUpdateMutation } from '@/modules/inbound-forms/mutations/useReceiverUpdateMutation.ts'
    import ReceiverDialog from '@/modules/inbound-forms/views/details/partials/ReceiverDialog.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ form: InboundFormDetailDto; senderDomain: string | null; canUpdate: boolean }>()

    const { t } = useI18n()
    const { xs } = useDisplay()
    const notify = useNotify()
    const confirm = useConfirm()
    const { templateBadge, activityBadge } = useReceiverStatus()
    const createMutation = useReceiverCreateMutation()
    const updateMutation = useReceiverUpdateMutation()
    const deleteMutation = useReceiverDeleteMutation()
    const { remove, isHidden } = useUndoRemove<number>()

    const dialogOpen = ref(false)
    const editingReceiver = ref<InboundFormReceiverDto | null>(null)
    const dialogError = ref<string | null>(null)
    const togglingId = ref<number | null>(null)

    const isSaving = computed(() => createMutation.isPending.value || updateMutation.isPending.value)
    const visibleReceivers = computed(() =>
        props.form.receivers.filter((receiver) => !isHidden(receiver.inboundFormReceiverId)),
    )
    const emailFields = computed(() =>
        props.form.fields
            .filter((field) => field.type === 'email')
            .map((field) => ({ key: field.key, label: field.label })),
    )

    function hasTemplate(receiver: InboundFormReceiverDto) {
        return receiver.draftVersion !== null || receiver.publishedVersion !== null
    }

    function templateAction(receiver: InboundFormReceiverDto) {
        if (!props.canUpdate) {
            return t('module.inboundForms.details.receivers.viewTemplate')
        }
        return hasTemplate(receiver)
            ? t('module.inboundForms.details.receivers.editTemplate')
            : t('module.inboundForms.details.receivers.writeTemplate')
    }

    function templateRoute(receiver: InboundFormReceiverDto) {
        return {
            name: RouteNames.INBOUND_FORM_TEMPLATE,
            params: { inboundFormId: props.form.inboundFormId, inboundFormReceiverId: receiver.inboundFormReceiverId },
        }
    }

    function openDialog(receiver: InboundFormReceiverDto | null) {
        editingReceiver.value = receiver
        dialogError.value = null
        dialogOpen.value = true
    }

    async function saveReceiver(payload: InboundFormReceiverCreateDto) {
        dialogError.value = null
        try {
            if (editingReceiver.value) {
                await updateMutation.mutateAsync({
                    inboundFormId: props.form.inboundFormId,
                    inboundFormReceiverId: editingReceiver.value.inboundFormReceiverId,
                    update: payload,
                })
                notify.success(t('module.inboundForms.details.receivers.saved'))
            } else {
                await createMutation.mutateAsync({ inboundFormId: props.form.inboundFormId, receiver: payload })
                notify.success(t('module.inboundForms.details.receivers.added'))
            }
            dialogOpen.value = false
        } catch (error) {
            dialogError.value = apiErrorMessage(error, t('dialog.tryAgain'))
        }
    }

    async function toggleActive(receiver: InboundFormReceiverDto) {
        togglingId.value = receiver.inboundFormReceiverId
        const next = !receiver.isActive
        try {
            await updateMutation.mutateAsync({
                inboundFormId: props.form.inboundFormId,
                inboundFormReceiverId: receiver.inboundFormReceiverId,
                update: { isActive: next },
            })
            notify.success(
                next
                    ? t('module.inboundForms.details.receivers.activated', { email: receiver.emailReceiver })
                    : t('module.inboundForms.details.receivers.deactivated', { email: receiver.emailReceiver }),
            )
        } catch {
            notify.error(t('module.inboundForms.details.receivers.toggleFailed', { email: receiver.emailReceiver }), {
                retry: () => void toggleActive(receiver),
            })
        } finally {
            togglingId.value = null
        }
    }

    function deleteRequest(receiver: InboundFormReceiverDto) {
        return deleteMutation.mutateAsync({
            inboundFormId: props.form.inboundFormId,
            inboundFormReceiverId: receiver.inboundFormReceiverId,
        })
    }

    async function removeReceiver(receiver: InboundFormReceiverDto) {
        if (!hasTemplate(receiver)) {
            remove(receiver.inboundFormReceiverId, {
                text: t('module.inboundForms.details.receivers.removed', { email: receiver.emailReceiver }),
                errorText: t('module.inboundForms.details.receivers.removeError', { email: receiver.emailReceiver }),
                commit: () => deleteRequest(receiver),
            })
            return
        }
        const versions = Math.max(receiver.draftVersion ?? 0, receiver.publishedVersion ?? 0)
        const confirmed = await confirm({
            title: t('module.inboundForms.details.receivers.confirmTitle', { email: receiver.emailReceiver }),
            body: t('module.inboundForms.details.receivers.confirmBody', { count: versions }, versions),
            confirmLabel: t('module.inboundForms.details.receivers.confirm'),
            destructive: true,
            errorText: t('module.inboundForms.details.receivers.removeError', { email: receiver.emailReceiver }),
            action: () => deleteRequest(receiver),
        })
        if (confirmed) {
            notify.success(t('module.inboundForms.details.receivers.removed', { email: receiver.emailReceiver }))
        }
    }
</script>

<style scoped>
    .receivers-card__route {
        overflow: hidden;
        text-overflow: ellipsis;
    }
</style>
