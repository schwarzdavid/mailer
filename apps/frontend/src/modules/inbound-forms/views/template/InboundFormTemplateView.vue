<template>
    <VContainer fluid v-if="form && receiver">
        <div class="d-flex align-center gc-3 mb-4">
            <VBtn
                icon="mdi-arrow-left"
                variant="text"
                size="small"
                :to="{ name: RouteNames.INBOUND_FORM_DETAILS, params: { inboundFormId } }"
            />
            <div>
                <h1>{{ t('module.inboundForms.template.title') }}</h1>
                <span class="text-medium-emphasis">{{ receiver.emailFrom }} → {{ receiver.emailReceiver }}</span>
            </div>
            <VSpacer />
            <VMenu v-if="versions && versions.length > 0">
                <template #activator="{ props: menuProps }">
                    <VBtn v-bind="menuProps" variant="text" :text="t('module.inboundForms.template.versions')" />
                </template>
                <VList>
                    <VListItem
                        v-for="version in versions"
                        :key="version.inboundFormTemplateId"
                        :title="
                            t('module.inboundForms.template.version', {
                                version: version.version,
                                status: t(`module.inboundForms.template.statusOptions.${version.status}`),
                            })
                        "
                        @click="loadVersion(version)"
                    />
                </VList>
            </VMenu>
            <VBtn
                data-testid="save-draft"
                :text="t('cta.saveDraft')"
                :loading="draftMutation.isPending.value"
                @click="saveDraft"
            />
            <VBtn
                data-testid="publish"
                color="primary"
                variant="elevated"
                :text="t('cta.publish')"
                :loading="publishMutation.isPending.value"
                @click="publish"
            />
        </div>
        <VAlert v-if="saveError" color="error" closable class="mb-4" @click:close="saveError = ''">
            {{ t('module.inboundForms.template.saveFailed', { error: saveError }) }}
        </VAlert>
        <VTextField name="subject" :label="t('module.inboundForms.template.subject')" v-model="subject" />
        <div class="d-flex align-center gc-2 mb-4 flex-wrap">
            <span class="text-medium-emphasis">{{ t('module.inboundForms.template.fieldsHint') }}:</span>
            <VChip
                v-for="field in form.fields"
                :key="field.inboundFormFieldId"
                size="small"
                @click="insertField(field.key)"
            >
                {{ field.key }}
            </VChip>
        </div>
        <VRow>
            <VCol cols="12" md="6">
                <MonacoEditor ref="editorRef" v-model="template" :field-keys="fieldKeys" />
            </VCol>
            <VCol cols="12" md="6">
                <TemplatePreview :template="template" :sample-data="sampleData" />
            </VCol>
        </VRow>
    </VContainer>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useRoute } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import type { InboundFormTemplateDto } from 'api'
    import { useInboundFormQuery } from '@/modules/inbound-forms/queries/useInboundFormQuery.ts'
    import { useInboundFormTemplatesQuery } from '@/modules/inbound-forms/queries/useInboundFormTemplatesQuery.ts'
    import { useTemplateDraftMutation } from '@/modules/inbound-forms/mutations/useTemplateDraftMutation.ts'
    import { useTemplatePublishMutation } from '@/modules/inbound-forms/mutations/useTemplatePublishMutation.ts'
    import { buildSampleData } from '@/modules/inbound-forms/helpers/sampleData.ts'
    import MonacoEditor from '@/modules/inbound-forms/views/template/partials/MonacoEditor.vue'
    import TemplatePreview from '@/modules/inbound-forms/views/template/partials/TemplatePreview.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const route = useRoute()
    const { t } = useI18n()

    const inboundFormId = computed(() => Number(route.params.inboundFormId))
    const inboundFormReceiverId = computed(() => Number(route.params.inboundFormReceiverId))

    const { data: form } = useQuery(useInboundFormQuery(inboundFormId))
    const { data: versions } = useQuery(useInboundFormTemplatesQuery(inboundFormId, inboundFormReceiverId))
    const draftMutation = useTemplateDraftMutation()
    const publishMutation = useTemplatePublishMutation()

    const subject = ref('')
    const template = ref('')
    const saveError = ref('')
    const initialized = ref(false)
    const editorRef = ref<InstanceType<typeof MonacoEditor>>()

    const receiver = computed(() =>
        form.value?.receivers.find(
            (formReceiver) => formReceiver.inboundFormReceiverId === inboundFormReceiverId.value,
        ),
    )

    const fieldKeys = computed(() => form.value?.fields.map((field) => field.key) ?? [])
    const sampleData = computed(() => buildSampleData(form.value?.fields ?? []))

    watch(
        versions,
        (loadedVersions) => {
            if (initialized.value || !loadedVersions) {
                return
            }
            initialized.value = true
            const initial = loadedVersions.find((version) => version.status === 'draft') ?? loadedVersions[0]
            if (initial) {
                subject.value = initial.subject
                template.value = initial.template
            }
        },
        { immediate: true },
    )

    function loadVersion(version: InboundFormTemplateDto) {
        subject.value = version.subject
        template.value = version.template
    }

    function insertField(key: string) {
        editorRef.value?.insertText(`{{${key}}}`)
    }

    function errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }

    async function saveDraft(): Promise<boolean> {
        saveError.value = ''
        try {
            await draftMutation.mutateAsync({
                inboundFormId: inboundFormId.value,
                inboundFormReceiverId: inboundFormReceiverId.value,
                draft: { subject: subject.value, template: template.value },
            })
            return true
        } catch (error) {
            saveError.value = errorMessage(error)
            return false
        }
    }

    async function publish() {
        if (!(await saveDraft())) {
            return
        }
        try {
            await publishMutation.mutateAsync({
                inboundFormId: inboundFormId.value,
                inboundFormReceiverId: inboundFormReceiverId.value,
            })
        } catch (error) {
            saveError.value = errorMessage(error)
        }
    }
</script>
