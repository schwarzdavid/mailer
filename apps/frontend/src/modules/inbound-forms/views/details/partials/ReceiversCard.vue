<template>
    <VCard :title="t('module.inboundForms.details.receivers.title')">
        <template #append>
            <VBtn :text="t('module.inboundForms.details.receivers.add')" @click="openDialog(null)" />
        </template>
        <VCardItem>
            <p v-if="form.receivers.length === 0">{{ t('module.inboundForms.details.receivers.empty') }}</p>
            <VList v-else>
                <VListItem v-for="receiver in form.receivers" :key="receiver.inboundFormReceiverId">
                    <template #title> {{ receiver.emailFrom }} → {{ receiver.emailReceiver }} </template>
                    <template #subtitle>
                        <span v-if="receiver.emailReplyTo">
                            {{ t('module.inboundForms.details.receivers.replyTo') }}: {{ receiver.emailReplyTo }} ·
                        </span>
                        <span>{{ templateLabel(receiver) }}</span>
                    </template>
                    <template #append>
                        <VChip :color="receiver.isActive ? 'success' : 'default'" size="small" class="mr-2">
                            {{
                                receiver.isActive
                                    ? t('module.inboundForms.status.active')
                                    : t('module.inboundForms.status.inactive')
                            }}
                        </VChip>
                        <VBtn
                            variant="text"
                            size="small"
                            :text="t('module.inboundForms.details.receivers.template.edit')"
                            :to="{
                                name: RouteNames.INBOUND_FORM_TEMPLATE,
                                params: {
                                    inboundFormId: form.inboundFormId,
                                    inboundFormReceiverId: receiver.inboundFormReceiverId,
                                },
                            }"
                        />
                        <VIconBtn icon="mdi-pencil" size="small" @click="openDialog(receiver)" />
                        <VIconBtn icon="mdi-delete" size="small" @click="removeReceiver(receiver)" />
                    </template>
                </VListItem>
            </VList>
        </VCardItem>
        <ReceiverDialog
            v-model="dialogOpen"
            :receiver="editingReceiver"
            :email-field-keys="emailFieldKeys"
            :domain-fqdn="domainFqdn"
            :saving="isSaving"
            @save="saveReceiver"
        />
    </VCard>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useQuery } from '@tanstack/vue-query'
    import type { InboundFormDetailDto, InboundFormReceiverCreateDto, InboundFormReceiverDto } from 'api'
    import { useDomainsQuery } from '@/modules/domains/queries/useDomainsQuery.ts'
    import { useReceiverCreateMutation } from '@/modules/inbound-forms/mutations/useReceiverCreateMutation.ts'
    import { useReceiverUpdateMutation } from '@/modules/inbound-forms/mutations/useReceiverUpdateMutation.ts'
    import { useReceiverDeleteMutation } from '@/modules/inbound-forms/mutations/useReceiverDeleteMutation.ts'
    import ReceiverDialog from '@/modules/inbound-forms/views/details/partials/ReceiverDialog.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ form: InboundFormDetailDto }>()

    const { t } = useI18n()
    const { data: domains } = useQuery(useDomainsQuery())
    const createMutation = useReceiverCreateMutation()
    const updateMutation = useReceiverUpdateMutation()
    const deleteMutation = useReceiverDeleteMutation()

    const dialogOpen = ref(false)
    const editingReceiver = ref<InboundFormReceiverDto | null>(null)

    const isSaving = computed(() => createMutation.isPending.value || updateMutation.isPending.value)

    const emailFieldKeys = computed(() =>
        props.form.fields.filter((field) => field.type === 'email').map((field) => field.key),
    )

    const domainFqdn = computed(
        () => domains.value?.find((domain) => domain.domainId === props.form.domainId)?.fqdn ?? null,
    )

    function openDialog(receiver: InboundFormReceiverDto | null) {
        editingReceiver.value = receiver
        dialogOpen.value = true
    }

    function templateLabel(receiver: InboundFormReceiverDto): string {
        if (receiver.draftVersion !== null) {
            return t('module.inboundForms.details.receivers.template.draft', { version: receiver.draftVersion })
        }
        if (receiver.publishedVersion !== null) {
            return t('module.inboundForms.details.receivers.template.published', {
                version: receiver.publishedVersion,
            })
        }
        return t('module.inboundForms.details.receivers.template.none')
    }

    async function saveReceiver(payload: InboundFormReceiverCreateDto) {
        if (editingReceiver.value) {
            await updateMutation.mutateAsync({
                inboundFormId: props.form.inboundFormId,
                inboundFormReceiverId: editingReceiver.value.inboundFormReceiverId,
                update: payload,
            })
        } else {
            await createMutation.mutateAsync({ inboundFormId: props.form.inboundFormId, receiver: payload })
        }
        dialogOpen.value = false
    }

    async function removeReceiver(receiver: InboundFormReceiverDto) {
        await deleteMutation.mutateAsync({
            inboundFormId: props.form.inboundFormId,
            inboundFormReceiverId: receiver.inboundFormReceiverId,
        })
    }
</script>
