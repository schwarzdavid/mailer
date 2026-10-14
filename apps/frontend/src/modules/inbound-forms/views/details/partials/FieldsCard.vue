<template>
    <SectionCard
        :title="t('module.inboundForms.details.fields.title')"
        :description="t('module.inboundForms.details.fields.description')"
        :count="visibleFields.length || undefined"
        flush
    >
        <template v-if="canUpdate" #actions>
            <VBtn
                size="small"
                :prepend-icon="mdiPlus"
                :text="t('module.inboundForms.details.fields.add')"
                @click="openDialog(null)"
            />
        </template>
        <EmptyState
            v-if="visibleFields.length === 0"
            :icon="mdiTextBoxOutline"
            :title="t('module.inboundForms.details.fields.empty.title')"
            :text="t('module.inboundForms.details.fields.empty.text')"
        />
        <VExpandTransition v-else-if="xs" group>
            <ListRow
                v-for="field in visibleFields"
                :key="field.key"
                :title="field.key"
                mono-title
                :subtitle="mobileSubtitle(field)"
            >
                <template v-if="canUpdate" #actions>
                    <VMenu>
                        <template #activator="{ props: activator }">
                            <IconButton
                                v-bind="activator"
                                :icon="mdiDotsVertical"
                                :label="t('module.inboundForms.details.fields.actions', { key: field.key })"
                                small
                            />
                        </template>
                        <VList density="compact">
                            <VListItem
                                :prepend-icon="mdiPencilOutline"
                                :title="t('module.inboundForms.details.fields.edit')"
                                @click="openDialog(field)"
                            />
                            <VListItem
                                class="text-error"
                                :prepend-icon="mdiDeleteOutline"
                                :title="t('module.inboundForms.details.fields.remove')"
                                @click="removeField(field)"
                            />
                        </VList>
                    </VMenu>
                </template>
            </ListRow>
        </VExpandTransition>
        <VDataTable
            v-else
            :headers="headers"
            :items="visibleFields"
            item-value="key"
            :items-per-page="-1"
            hide-default-footer
        >
            <template #[`item.key`]="{ item }">
                <span class="mono">{{ item.key }}</span>
            </template>
            <template #[`item.type`]="{ item }">
                <TagLabel :label="t(`module.inboundForms.details.fields.typeOptions.${item.type}`)" />
            </template>
            <template #[`item.required`]="{ item }">
                <span v-if="item.validation?.required" class="fields-card__required">
                    <VIcon :icon="mdiCheck" size="16" aria-hidden="true" />
                    {{ t('module.inboundForms.details.fields.requiredYes') }}
                </span>
                <span v-else class="text-ink-muted">{{ t('module.inboundForms.details.fields.optional') }}</span>
            </template>
            <template #[`item.rules`]="{ item }">
                <span :class="{ 'text-ink-muted': rules(item).length === 0 }">{{
                    rules(item).join(' · ') || '—'
                }}</span>
            </template>
            <template #[`item.actions`]="{ item }">
                <IconButton
                    :icon="mdiPencilOutline"
                    :label="t('module.inboundForms.details.fields.editLabel', { key: item.key })"
                    small
                    @click="openDialog(item)"
                />
                <IconButton
                    :icon="mdiDeleteOutline"
                    :label="t('module.inboundForms.details.fields.removeLabel', { key: item.key })"
                    small
                    danger
                    @click="removeField(item)"
                />
            </template>
        </VDataTable>
    </SectionCard>
    <FieldDialog
        v-if="canUpdate"
        v-model="dialogOpen"
        :field="editingField"
        :existing-keys="visibleFields.map((field) => field.key)"
        :saving="isPending"
        :error="dialogError"
        @save="saveField"
    />
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useDisplay } from 'vuetify'
    import { mdiCheck, mdiDeleteOutline, mdiDotsVertical, mdiPencilOutline, mdiPlus, mdiTextBoxOutline } from '@mdi/js'
    import type { InboundFormDetailDto, InboundFormFieldDto, InboundFormFieldUpsertDto } from 'api'
    import EmptyState from '@/components/EmptyState.vue'
    import IconButton from '@/components/IconButton.vue'
    import ListRow from '@/components/ListRow.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import TagLabel from '@/components/TagLabel.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useUndoRemove } from '@/composables/useUndoRemove.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { useFieldRules } from '@/modules/inbound-forms/helpers/fieldRules.ts'
    import { useInboundFormFieldsMutation } from '@/modules/inbound-forms/mutations/useInboundFormFieldsMutation.ts'
    import FieldDialog from '@/modules/inbound-forms/views/details/partials/FieldDialog.vue'

    const props = defineProps<{ form: InboundFormDetailDto; canUpdate: boolean }>()

    const { t } = useI18n()
    const { xs } = useDisplay()
    const notify = useNotify()
    const rules = useFieldRules()
    const { mutateAsync, isPending } = useInboundFormFieldsMutation()
    const { remove, isHidden } = useUndoRemove<string>()

    const dialogOpen = ref(false)
    const editingField = ref<InboundFormFieldDto | null>(null)
    const dialogError = ref<string | null>(null)

    const visibleFields = computed(() => props.form.fields.filter((field) => !isHidden(field.key)))

    const headers = computed(() => [
        { key: 'key', title: t('module.inboundForms.details.fields.key'), sortable: false },
        { key: 'label', title: t('module.inboundForms.details.fields.label'), sortable: false },
        { key: 'type', title: t('module.inboundForms.details.fields.type'), sortable: false },
        { key: 'required', title: t('module.inboundForms.details.fields.required'), sortable: false },
        { key: 'rules', title: t('module.inboundForms.details.fields.rules'), sortable: false },
        ...(props.canUpdate
            ? [
                  {
                      key: 'actions',
                      title: t('module.inboundForms.details.fields.actionsColumn'),
                      sortable: false,
                      align: 'end' as const,
                  },
              ]
            : []),
    ])

    function mobileSubtitle(field: InboundFormFieldDto) {
        return [
            field.label,
            t(`module.inboundForms.details.fields.typeOptions.${field.type}`),
            field.validation?.required
                ? t('module.inboundForms.details.fields.requiredYes')
                : t('module.inboundForms.details.fields.optional'),
            ...rules(field),
        ].join(' · ')
    }

    function openDialog(field: InboundFormFieldDto | null) {
        editingField.value = field
        dialogError.value = null
        dialogOpen.value = true
    }

    function toUpsert(field: InboundFormFieldDto): InboundFormFieldUpsertDto {
        return {
            key: field.key,
            label: field.label,
            type: field.type,
            defaultValue: field.defaultValue ?? null,
            validation: field.validation ?? null,
        }
    }

    async function saveField(payload: InboundFormFieldUpsertDto) {
        const current = visibleFields.value.map(toUpsert)
        const originalKey = editingField.value?.key ?? null
        const fields =
            originalKey === null
                ? [...current, payload]
                : current.map((field) => (field.key === originalKey ? payload : field))

        dialogError.value = null
        try {
            await mutateAsync({ inboundFormId: props.form.inboundFormId, fields })
            dialogOpen.value = false
            notify.success(
                originalKey === null
                    ? t('module.inboundForms.details.fields.added', { key: payload.key })
                    : t('module.inboundForms.details.fields.saved', { key: payload.key }),
            )
        } catch (error) {
            dialogError.value = apiErrorMessage(error, t('dialog.tryAgain'))
        }
    }

    function removeField(field: InboundFormFieldDto) {
        remove(field.key, {
            text: t('module.inboundForms.details.fields.removed', { key: field.key }),
            errorText: t('module.inboundForms.details.fields.removeError', { key: field.key }),
            commit: () =>
                mutateAsync({
                    inboundFormId: props.form.inboundFormId,
                    fields: props.form.fields
                        .filter((candidate) => candidate.key !== field.key && !isHidden(candidate.key))
                        .map(toUpsert),
                }),
        })
    }
</script>

<style scoped>
    .fields-card__required {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }
</style>
