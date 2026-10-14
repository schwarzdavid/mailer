<template>
    <PageHeader :title="t('module.inboundForms.template.title')" :loading="isFormPending" :breadcrumbs="breadcrumbs">
        <template v-if="editingVersion" #status>
            <StatusBadge v-bind="versionBadge(editingVersion)" large />
        </template>
        <template v-if="receiver" #meta>
            <span class="mono template-view__route">{{ receiver.emailFrom }} → {{ receiver.emailReceiver }}</span>
            <span v-if="liveVersion">
                {{ t('module.inboundForms.template.live', { version: liveVersion.version }) }}
                <RelativeTime :value="liveVersion.updatedAt" />
            </span>
            <span v-if="dirty" class="template-view__unsaved">
                <StatusDot tone="warning" />
                {{ t('form.unsavedChanges') }}
            </span>
        </template>
        <template v-if="receiver" #actions>
            <VMenu v-if="versions && versions.length > 0">
                <template #activator="{ props: menuProps }">
                    <VBtn
                        v-bind="menuProps"
                        variant="text"
                        :append-icon="mdiChevronDown"
                        :text="t('module.inboundForms.template.versions')"
                    />
                </template>
                <div class="versions-menu">
                    <div class="versions-menu__header">{{ t('module.inboundForms.template.versionsTitle') }}</div>
                    <button
                        v-for="version in versions"
                        :key="version.inboundFormTemplateId"
                        type="button"
                        class="versions-menu__item"
                        :class="{ 'versions-menu__item--selected': version.inboundFormTemplateId === loadedVersionId }"
                        @click="loadVersion(version)"
                    >
                        <StatusBadge v-bind="versionBadge(version)" />
                        <span class="versions-menu__meta">
                            <template v-if="version.inboundFormTemplateId === loadedVersionId"
                                >{{ t('module.inboundForms.template.editing') }} ·
                            </template>
                            <template v-else-if="version.inboundFormTemplateId === liveVersion?.inboundFormTemplateId"
                                >{{ t('module.inboundForms.template.liveShort') }} ·
                            </template>
                            {{ dates.smart(version.updatedAt) }}
                        </span>
                        <VIcon v-if="version.inboundFormTemplateId === loadedVersionId" :icon="mdiCheck" size="18" />
                    </button>
                    <p class="versions-menu__note">{{ t('module.inboundForms.template.versionsNote') }}</p>
                </div>
            </VMenu>
            <template v-if="canUpdate">
                <VBtn
                    data-testid="save-draft"
                    :text="t('cta.saveDraft')"
                    :loading="draftMutation.isPending.value"
                    @click="saveDraft"
                />
                <VBtn
                    data-testid="publish"
                    variant="flat"
                    color="primary"
                    :text="t('cta.publish')"
                    :loading="publishMutation.isPending.value"
                    @click="publish"
                />
            </template>
        </template>
    </PageHeader>

    <ErrorState
        v-if="formError"
        :kind="apiErrorStatus(formErrorValue) === 404 ? 'notFound' : 'load'"
        size="page"
        :thing="t('module.inboundForms.template.thing')"
        :error="formErrorValue"
        @retry="refetchForm()"
    />
    <EditorSkeleton v-else-if="isFormPending || isVersionsPending" />
    <ErrorState
        v-else-if="form && !receiver"
        kind="notFound"
        size="page"
        :thing="t('module.inboundForms.template.receiverThing')"
    >
        <template #actions>
            <VBtn
                variant="text"
                :to="{ name: RouteNames.INBOUND_FORM_DETAILS, params: { inboundFormId } }"
                :text="t('module.inboundForms.template.backToForm')"
            />
        </template>
    </ErrorState>
    <div v-else-if="form && receiver" class="template-view">
        <InlineAlert
            v-if="saveError"
            tone="error"
            :title="t('module.inboundForms.template.saveFailed')"
            :text="saveError"
        >
            <template #actions>
                <VBtn size="small" :text="t('state.retry')" @click="saveDraft" />
            </template>
        </InlineAlert>
        <VTextField
            v-model="subject"
            name="subject"
            :label="t('module.inboundForms.template.subject')"
            :hint="t('module.inboundForms.template.subjectHint')"
            persistent-hint
            :readonly="!canUpdate"
        />
        <div class="template-view__toolbar">
            <div v-if="canUpdate && form.fields.length" class="template-view__insert">
                <template v-if="!smAndDown">
                    <span class="template-view__insert-label">{{ t('module.inboundForms.template.insertLabel') }}</span>
                    <VBtn
                        v-for="field in form.fields"
                        :key="field.inboundFormFieldId"
                        size="small"
                        class="template-view__insert-key"
                        :aria-label="t('module.inboundForms.template.insertField', { key: field.key })"
                        :text="field.key"
                        @click="insertField(field.key)"
                    />
                </template>
                <VMenu v-else>
                    <template #activator="{ props: menuProps }">
                        <VBtn
                            v-bind="menuProps"
                            size="small"
                            :prepend-icon="mdiPlus"
                            :text="t('module.inboundForms.template.insertLabel')"
                        />
                    </template>
                    <VList density="compact">
                        <VListItem
                            v-for="field in form.fields"
                            :key="field.inboundFormFieldId"
                            :title="field.key"
                            :subtitle="field.label"
                            @click="insertField(field.key)"
                        />
                    </VList>
                </VMenu>
            </div>
            <VBtnToggle
                :model-value="effectiveLayout"
                mandatory
                density="compact"
                class="template-view__layout"
                :aria-label="t('module.inboundForms.template.layout.label')"
                @update:model-value="layout = $event"
            >
                <VBtn
                    value="editor"
                    size="small"
                    :prepend-icon="mdiCodeTags"
                    :text="t('module.inboundForms.template.layout.editor')"
                />
                <VBtn
                    v-if="!smAndDown"
                    value="split"
                    size="small"
                    :prepend-icon="mdiViewSplitVertical"
                    :text="t('module.inboundForms.template.layout.split')"
                />
                <VBtn
                    value="preview"
                    size="small"
                    :prepend-icon="mdiEyeOutline"
                    :text="t('module.inboundForms.template.layout.preview')"
                />
            </VBtnToggle>
        </div>
        <div class="template-view__panes" :class="{ 'template-view__panes--single': effectiveLayout !== 'split' }">
            <section v-show="effectiveLayout !== 'preview'" class="template-pane">
                <header class="template-pane__bar">
                    <strong>{{ t('module.inboundForms.template.paneTitle') }}</strong>
                    <span>{{ t('module.inboundForms.template.paneLanguage') }}</span>
                    <span class="template-pane__grow" />
                    <span class="tabular-nums">{{ t('module.inboundForms.template.cursor', cursor) }}</span>
                </header>
                <div v-if="!template && !startedEmpty && canUpdate" class="template-pane__empty">
                    <EmptyState
                        :icon="mdiCodeTags"
                        :title="t('module.inboundForms.template.noTemplate.title')"
                        :text="t('module.inboundForms.template.noTemplate.text')"
                    >
                        <template #actions>
                            <VBtn
                                variant="flat"
                                color="primary"
                                :text="t('module.inboundForms.template.noTemplate.layout')"
                                @click="useFieldLayout"
                            />
                            <VBtn
                                variant="text"
                                :text="t('module.inboundForms.template.noTemplate.empty')"
                                @click="startedEmpty = true"
                            />
                        </template>
                    </EmptyState>
                </div>
                <MonacoEditor
                    v-else
                    ref="editorRef"
                    v-model="template"
                    class="template-pane__editor"
                    :field-keys="fieldKeys"
                    :read-only="!canUpdate"
                    :error-line="errorLine"
                    @save="saveDraft"
                    @cursor="cursor = $event"
                />
                <footer class="template-pane__foot">{{ t('module.inboundForms.template.shortcutHint') }}</footer>
            </section>
            <section v-show="effectiveLayout !== 'editor'" class="template-pane">
                <header class="template-pane__bar">
                    <strong>{{ t('module.inboundForms.template.previewTitle') }}</strong>
                    <span class="template-pane__grow" />
                    <VBtnToggle v-model="device" mandatory density="compact" class="template-pane__device">
                        <VBtn
                            value="desktop"
                            size="small"
                            :prepend-icon="mdiMonitor"
                            :text="t('module.inboundForms.template.desktop')"
                        />
                        <VBtn
                            value="mobile"
                            size="small"
                            :prepend-icon="mdiCellphone"
                            :text="t('module.inboundForms.template.mobile')"
                        />
                    </VBtnToggle>
                </header>
                <div class="template-pane__preview">
                    <TemplatePreview
                        :template="template"
                        :subject="subject"
                        :sample-data="sampleData"
                        :from="receiver.emailFrom"
                        :to="receiver.emailReceiver"
                        :reply-to="receiver.emailReplyTo"
                        :device="device"
                        @error="errorLine = $event"
                    />
                </div>
            </section>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed, ref, useTemplateRef, watch } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useRoute } from 'vue-router'
    import { useI18n } from 'vue-i18n'
    import { useDisplay } from 'vuetify'
    import { useAbility } from '@casl/vue'
    import { subject as caslSubject } from '@casl/ability'
    import {
        mdiCellphone,
        mdiCheck,
        mdiChevronDown,
        mdiCodeTags,
        mdiEyeOutline,
        mdiMonitor,
        mdiPlus,
        mdiViewSplitVertical,
    } from '@mdi/js'
    import { useLocalStorage } from '@vueuse/core'
    import type { InboundFormTemplateDto } from 'api'
    import EmptyState from '@/components/EmptyState.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import InlineAlert from '@/components/InlineAlert.vue'
    import PageHeader from '@/components/PageHeader.vue'
    import RelativeTime from '@/components/RelativeTime.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import StatusDot from '@/components/StatusDot.vue'
    import EditorSkeleton from '@/components/skeletons/EditorSkeleton.vue'
    import { useConfirm } from '@/composables/useConfirm.ts'
    import { useDates } from '@/composables/useDates.ts'
    import { useDirtyGuard } from '@/composables/useDirtyGuard.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { apiErrorStatus } from '@/helper/apiErrorStatus.ts'
    import { fieldLayoutTemplate } from '@/modules/inbound-forms/helpers/fieldLayout.ts'
    import { buildSampleData } from '@/modules/inbound-forms/helpers/sampleData.ts'
    import { useTemplateDraftMutation } from '@/modules/inbound-forms/mutations/useTemplateDraftMutation.ts'
    import { useTemplatePublishMutation } from '@/modules/inbound-forms/mutations/useTemplatePublishMutation.ts'
    import { useInboundFormQuery } from '@/modules/inbound-forms/queries/useInboundFormQuery.ts'
    import { useInboundFormTemplatesQuery } from '@/modules/inbound-forms/queries/useInboundFormTemplatesQuery.ts'
    import MonacoEditor from '@/modules/inbound-forms/views/template/partials/MonacoEditor.vue'
    import TemplatePreview from '@/modules/inbound-forms/views/template/partials/TemplatePreview.vue'
    import { useProjectQuery } from '@/modules/projects/queries/useProjectQuery.ts'
    import { RouteNames } from '@/router/RouteNames.ts'
    import type { Breadcrumb } from '@/components/breadcrumb.ts'

    const route = useRoute()
    const { t } = useI18n()
    const { smAndDown } = useDisplay()
    const userAbility = useAbility()
    const dates = useDates()
    const confirm = useConfirm()
    const notify = useNotify()

    const inboundFormId = computed(() => Number(route.params.inboundFormId))
    const inboundFormReceiverId = computed(() => Number(route.params.inboundFormReceiverId))

    const {
        data: form,
        isPending: isFormPending,
        isError: formError,
        error: formErrorValue,
        refetch: refetchForm,
    } = useQuery(useInboundFormQuery(inboundFormId))
    const { data: versions, isPending: isVersionsPending } = useQuery(
        useInboundFormTemplatesQuery(inboundFormId, inboundFormReceiverId),
    )
    const projectId = computed(() => form.value?.projectId ?? 0)
    const { queryKey: projectKey, queryFn: projectFn } = useProjectQuery(projectId)
    const { data: project } = useQuery({
        queryKey: projectKey,
        queryFn: projectFn,
        enabled: computed(() => !!form.value),
    })
    const draftMutation = useTemplateDraftMutation()
    const publishMutation = useTemplatePublishMutation()

    const subject = ref('')
    const template = ref('')
    const savedSubject = ref('')
    const savedTemplate = ref('')
    const saveError = ref('')
    const initialized = ref(false)
    const startedEmpty = ref(false)
    const loadedVersionId = ref<number | null>(null)
    const errorLine = ref<number | null>(null)
    const cursor = ref({ line: 1, column: 1 })
    const device = ref<'desktop' | 'mobile'>('desktop')
    const layout = useLocalStorage<'editor' | 'split' | 'preview'>('template-editor-layout', 'split')
    const effectiveLayout = computed(() => (smAndDown.value && layout.value === 'split' ? 'editor' : layout.value))
    const editorRef = useTemplateRef<InstanceType<typeof MonacoEditor>>('editorRef')

    const canUpdate = computed(() => userAbility.can('update', caslSubject('Project', { projectId: projectId.value })))
    const receiver = computed(() =>
        form.value?.receivers.find(
            (formReceiver) => formReceiver.inboundFormReceiverId === inboundFormReceiverId.value,
        ),
    )
    const fieldKeys = computed(() => form.value?.fields.map((field) => field.key) ?? [])
    const sampleData = computed(() => buildSampleData(form.value?.fields ?? []))
    const liveVersion = computed(() => versions.value?.find((version) => version.status === 'published'))
    const editingVersion = computed(() =>
        versions.value?.find((version) => version.inboundFormTemplateId === loadedVersionId.value),
    )
    const dirty = computed(() => subject.value !== savedSubject.value || template.value !== savedTemplate.value)

    const breadcrumbs = computed(() => {
        const crumbs: Breadcrumb[] = [{ title: t('nav.projects'), to: { name: RouteNames.PROJECT_LIST } }]
        if (project.value) {
            crumbs.push({
                title: project.value.name,
                to: { name: RouteNames.PROJECT_DETAILS, params: { projectId: project.value.projectId } },
            })
        }
        if (form.value) {
            crumbs.push({
                title: form.value.name,
                to: { name: RouteNames.INBOUND_FORM_DETAILS, params: { inboundFormId: inboundFormId.value } },
            })
        }
        return crumbs
    })

    useDirtyGuard(dirty)

    watch(
        versions,
        (loadedVersions) => {
            if (initialized.value || !loadedVersions) {
                return
            }
            initialized.value = true
            const initial = loadedVersions.find((version) => version.status === 'draft') ?? loadedVersions[0]
            if (initial) {
                applyVersion(initial)
            }
        },
        { immediate: true },
    )

    function applyVersion(version: InboundFormTemplateDto) {
        subject.value = version.subject
        template.value = version.template
        savedSubject.value = version.subject
        savedTemplate.value = version.template
        loadedVersionId.value = version.inboundFormTemplateId
    }

    function versionBadge(version: InboundFormTemplateDto) {
        return version.status === 'published'
            ? { tone: 'success' as const, label: t('status.published', { version: version.version }) }
            : { tone: 'info' as const, label: t('status.draft', { version: version.version }) }
    }

    function loadVersion(version: InboundFormTemplateDto) {
        subject.value = version.subject
        template.value = version.template
        loadedVersionId.value = version.inboundFormTemplateId
    }

    function insertField(key: string) {
        editorRef.value?.insertText(`{{${key}}}`)
    }

    function useFieldLayout() {
        if (!form.value) {
            return
        }
        template.value = fieldLayoutTemplate(form.value.name, form.value.fields)
        if (!subject.value) {
            subject.value = form.value.name
        }
    }

    async function saveDraft(): Promise<InboundFormTemplateDto | null> {
        if (!canUpdate.value) {
            return null
        }
        saveError.value = ''
        try {
            const saved = await draftMutation.mutateAsync({
                inboundFormId: inboundFormId.value,
                inboundFormReceiverId: inboundFormReceiverId.value,
                draft: { subject: subject.value, template: template.value },
            })
            savedSubject.value = saved.subject
            savedTemplate.value = saved.template
            loadedVersionId.value = saved.inboundFormTemplateId
            return saved
        } catch (error) {
            saveError.value = apiErrorMessage(error, t('module.inboundForms.template.unknownError'))
            return null
        }
    }

    async function publish() {
        const nextVersion =
            editingVersion.value?.status === 'draft'
                ? editingVersion.value.version
                : (liveVersion.value?.version ?? 0) + 1
        const confirmed = await confirm({
            title: t('module.inboundForms.template.publishConfirm.title', { version: nextVersion }),
            body: t('module.inboundForms.template.publishConfirm.body', { email: receiver.value?.emailReceiver ?? '' }),
            confirmLabel: t('cta.publish'),
        })
        if (!confirmed) {
            return
        }
        const saved = await saveDraft()
        if (!saved) {
            return
        }
        try {
            const published = await publishMutation.mutateAsync({
                inboundFormId: inboundFormId.value,
                inboundFormReceiverId: inboundFormReceiverId.value,
            })
            loadedVersionId.value = published.inboundFormTemplateId
            notify.success(t('module.inboundForms.template.published', { version: published.version }), {
                link: {
                    label: t('module.inboundForms.template.backToForm'),
                    to: { name: RouteNames.INBOUND_FORM_DETAILS, params: { inboundFormId: inboundFormId.value } },
                },
            })
        } catch (error) {
            saveError.value = apiErrorMessage(error, t('module.inboundForms.template.unknownError'))
        }
    }
</script>

<style scoped>
    .template-view {
        display: flex;
        flex-direction: column;
        gap: 16px;
        height: calc(100dvh - 220px);
        min-height: 560px;
    }

    .template-view__route {
        color: rgb(var(--v-theme-ink));
        font-size: 0.8125rem;
    }

    .template-view__unsaved {
        color: rgb(var(--v-theme-ink));
    }

    .template-view__insert {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
    }

    .template-view__insert-label {
        margin-right: 4px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        font-weight: 500;
    }

    .template-view__insert-key {
        font-family: var(--font-mono);
        font-size: 0.8125rem;
        font-weight: 400;
    }

    .template-view > * {
        flex: none;
    }

    .template-view__toolbar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px 16px;
    }

    .template-view__toolbar .template-view__insert {
        flex: 1 1 auto;
        min-width: 0;
    }

    .template-view__layout {
        margin-left: auto;
        border: 1px solid rgb(var(--v-theme-border-strong));
    }

    .template-view__layout :deep(.v-btn--active) {
        background: rgb(var(--v-theme-primary-container));
        color: rgb(var(--v-theme-on-primary-container));
    }

    .template-view__panes {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        flex: 1 1 0;
        min-height: 0;
    }

    .template-view__panes--single {
        grid-template-columns: minmax(0, 1fr);
    }

    .template-pane {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        border: 1px solid rgb(var(--v-theme-border));
        border-radius: 10px;
        background: rgb(var(--v-theme-surface));
    }

    .template-pane__bar {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        padding: 0 8px 0 16px;
        border-bottom: 1px solid rgb(var(--v-theme-border));
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        font-weight: 500;
    }

    .template-pane__bar strong {
        color: rgb(var(--v-theme-ink));
        font-size: 0.8125rem;
        font-weight: 600;
    }

    .template-pane__grow {
        flex: 1;
    }

    .template-pane__editor,
    .template-pane__empty {
        flex: 1;
        min-height: 0;
    }

    .template-pane__empty {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .template-pane__foot {
        display: flex;
        align-items: center;
        min-height: 32px;
        padding: 0 16px;
        border-top: 1px solid rgb(var(--v-theme-border));
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
    }

    .template-pane__preview {
        flex: 1;
        min-height: 0;
        padding: 16px;
        overflow: auto;
    }

    .versions-menu {
        min-width: 280px;
        padding: 4px;
        border: 1px solid rgb(var(--v-theme-border));
        border-radius: 10px;
        background: rgb(var(--v-theme-surface-overlay));
    }

    .versions-menu__header {
        padding: 8px 12px 4px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        font-weight: 500;
    }

    .versions-menu__item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-height: 40px;
        padding: 6px 12px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: rgb(var(--v-theme-ink));
        text-align: left;
        cursor: pointer;
    }

    .versions-menu__item:hover {
        background: rgb(var(--v-theme-surface-hover));
    }

    .versions-menu__item--selected {
        background: rgb(var(--v-theme-primary-container));
        color: rgb(var(--v-theme-on-primary-container));
    }

    .versions-menu__meta {
        flex: 1;
        color: inherit;
        font-size: 0.75rem;
    }

    .versions-menu__note {
        margin: 4px 0 0;
        padding: 8px 12px;
        border-top: 1px solid rgb(var(--v-theme-border));
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
    }

    @media (max-width: 959.98px) {
        .template-view {
            height: auto;
            min-height: 0;
        }

        .template-view__panes {
            grid-template-columns: minmax(0, 1fr);
        }

        .template-pane {
            min-height: 480px;
        }
    }
</style>
