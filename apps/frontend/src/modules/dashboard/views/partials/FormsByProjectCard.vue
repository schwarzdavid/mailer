<template>
    <SectionCard
        :title="t('module.dashboard.forms.title')"
        :description="
            canCreateProjects ? t('module.dashboard.forms.description') : t('module.dashboard.forms.descriptionMember')
        "
        :count="data.forms.data.value?.length"
        :refetching="data.forms.isFetching.value && !data.forms.isPending.value"
        flush
    >
        <ListSkeleton v-if="data.forms.isPending.value || data.projects.isPending.value" />
        <ErrorState
            v-else-if="data.forms.isError.value || data.projects.isError.value"
            :thing="t('module.dashboard.forms.thing')"
            @retry="retry"
        />
        <template v-else>
            <template v-for="group in groups" :key="group.project.projectId">
                <div class="forms-group">
                    <RouterLink
                        :to="{ name: RouteNames.PROJECT_DETAILS, params: { projectId: group.project.projectId } }"
                        class="forms-group__link"
                    >
                        {{ group.project.name }}
                        <VIcon :icon="mdiChevronRight" size="16" aria-hidden="true" />
                    </RouterLink>
                    <span>{{
                        t('module.projects.counts.forms', { count: group.forms.length }, group.forms.length)
                    }}</span>
                </div>
                <ListRow
                    v-for="form in group.forms"
                    :key="form.inboundFormId"
                    :icon="mdiFormSelect"
                    :title="form.name"
                    :to="{ name: RouteNames.INBOUND_FORM_DETAILS, params: { inboundFormId: form.inboundFormId } }"
                >
                    <template #subtitle>
                        <span class="mono">{{ form.slug }}</span>
                        <span class="row-sep">·</span>
                        {{
                            t(
                                'module.inboundForms.receiverCount',
                                { count: form.receivers.length },
                                form.receivers.length,
                            )
                        }}
                    </template>
                    <template #meta>
                        <StatusBadge v-bind="activityBadge(form.isActive)" />
                    </template>
                </ListRow>
                <div v-if="group.forms.length === 0" class="forms-group__empty">
                    {{ t('module.dashboard.forms.noForms') }}
                    <VBtn
                        v-if="canUpdate(group.project.projectId)"
                        size="small"
                        :prepend-icon="mdiPlus"
                        :text="t('module.projects.details.forms.add')"
                        @click="createFor = group.project.projectId"
                    />
                </div>
            </template>
        </template>
    </SectionCard>
    <AddInboundFormDialog
        v-if="createFor !== null"
        :model-value="createFor !== null"
        :project-id="createFor"
        @update:model-value="createFor = $event ? createFor : null"
    />
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import { mdiChevronRight, mdiFormSelect, mdiPlus } from '@mdi/js'
    import ErrorState from '@/components/ErrorState.vue'
    import ListRow from '@/components/ListRow.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import ListSkeleton from '@/components/skeletons/ListSkeleton.vue'
    import type { useDashboardData } from '@/modules/dashboard/composables/useDashboardData.ts'
    import AddInboundFormDialog from '@/modules/inbound-forms/components/AddInboundFormDialog.vue'
    import { useReceiverStatus } from '@/modules/inbound-forms/helpers/receiverStatus.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ data: ReturnType<typeof useDashboardData> }>()

    const { t } = useI18n()
    const userAbility = useAbility()
    const { activityBadge } = useReceiverStatus()
    const createFor = ref<number | null>(null)

    const canCreateProjects = computed(() => userAbility.can('create', 'Project'))

    const groups = computed(() =>
        (props.data.projects.data.value ?? []).map((project) => ({
            project,
            forms: (props.data.forms.data.value ?? []).filter((form) => form.projectId === project.projectId),
        })),
    )

    function canUpdate(projectId: number) {
        return userAbility.can('update', subject('Project', { projectId }))
    }

    function retry() {
        void props.data.forms.refetch()
        void props.data.projects.refetch()
    }
</script>

<style scoped>
    .forms-group {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 24px 6px;
        border-top: 1px solid rgb(var(--v-theme-border));
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1rem;
    }

    .forms-group:first-child {
        padding-top: 6px;
        border-top: 0;
    }

    .forms-group__link {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        color: rgb(var(--v-theme-ink));
        font-size: 0.8125rem;
        font-weight: 600;
        text-decoration: none;
    }

    .forms-group__link:hover {
        text-decoration: underline;
    }

    .forms-group__empty {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 24px 12px;
        color: rgb(var(--v-theme-ink-muted));
    }

    @media (max-width: 599.98px) {
        .forms-group,
        .forms-group__empty {
            padding-left: 16px;
            padding-right: 16px;
        }
    }
</style>
