<template>
    <VCard :title="t('module.inboundForms.details.fields.title')">
        <template #append>
            <VBtn :text="t('module.inboundForms.details.fields.add')" @click="openDialog(null)" />
        </template>
        <VCardItem>
            <p v-if="form.fields.length === 0">{{ t('module.inboundForms.details.fields.empty') }}</p>
            <VTable v-else>
                <thead>
                    <tr>
                        <th>{{ t('module.inboundForms.details.fields.key') }}</th>
                        <th>{{ t('module.inboundForms.details.fields.label') }}</th>
                        <th>{{ t('module.inboundForms.details.fields.type') }}</th>
                        <th>{{ t('module.inboundForms.details.fields.required') }}</th>
                        <th />
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="field in form.fields" :key="field.inboundFormFieldId">
                        <td>
                            <code>{{ field.key }}</code>
                        </td>
                        <td>{{ field.label }}</td>
                        <td>{{ t(`module.inboundForms.details.fields.typeOptions.${field.type}`) }}</td>
                        <td>
                            <VIcon v-if="field.validation?.required" icon="mdi-check" />
                        </td>
                        <td class="text-right">
                            <VIconBtn icon="mdi-pencil" size="small" @click="openDialog(field)" />
                            <VIconBtn icon="mdi-delete" size="small" @click="removeField(field.key)" />
                        </td>
                    </tr>
                </tbody>
            </VTable>
        </VCardItem>
        <FieldDialog v-model="dialogOpen" :field="editingField" :saving="isPending" @save="saveField" />
    </VCard>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormDetailDto, InboundFormFieldDto, InboundFormFieldUpsertDto } from 'api'
    import { useInboundFormFieldsMutation } from '@/modules/inbound-forms/mutations/useInboundFormFieldsMutation.ts'
    import FieldDialog from '@/modules/inbound-forms/views/details/partials/FieldDialog.vue'

    const props = defineProps<{ form: InboundFormDetailDto }>()

    const { t } = useI18n()
    const { mutateAsync, isPending } = useInboundFormFieldsMutation()

    const dialogOpen = ref(false)
    const editingField = ref<InboundFormFieldDto | null>(null)

    function openDialog(field: InboundFormFieldDto | null) {
        editingField.value = field
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
        const current = props.form.fields.map(toUpsert)
        const originalKey = editingField.value?.key ?? null
        const fields =
            originalKey === null
                ? [...current, payload]
                : current.map((field) => (field.key === originalKey ? payload : field))

        await mutateAsync({ inboundFormId: props.form.inboundFormId, fields })
        dialogOpen.value = false
    }

    async function removeField(key: string) {
        const fields = props.form.fields.map(toUpsert).filter((field) => field.key !== key)

        await mutateAsync({ inboundFormId: props.form.inboundFormId, fields })
    }
</script>
