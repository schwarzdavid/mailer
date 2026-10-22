<template>
    <SectionCard
        :title="t('module.projects.details.forms.title')"
        :description="t('module.projects.details.forms.description')"
        :count="forms?.length"
        :refetching="isFetching && !isPending"
        flush
    >
        <template v-if="canUpdate" #actions>
            <VBtn
                size="small"
                :prepend-icon="mdiPlus"
                :text="t('module.projects.details.forms.add')"
                @click="createOpen = true"
            />
        </template>
        <ListSkeleton v-if="isPending" />
        <ErrorState
            v-else-if="isError"
            :thing="t('module.projects.details.forms.thing')"
            :error="error"
            @retry="refetch()"
        />
        <EmptyState
            v-else-if="forms && forms.length === 0"
            :icon="mdiFormSelect"
            :title="t('module.projects.details.forms.empty.title')"
            :text="t('module.projects.details.forms.empty.text')"
        />
        <ListRow
            v-for="form in forms"
            v-else
            :key="form.inboundFormId"
            :icon="mdiFormSelect"
            :title="form.name"
            :to="{ name: RouteNames.INBOUND_FORM_DETAILS, params: { inboundFormId: form.inboundFormId } }"
        >
            <template #subtitle>
                <span class="mono">{{ form.slug }}</span>
                <span class="row-sep">·</span>
                {{ t('module.inboundForms.receiverCount', { count: form.receivers.length }, form.receivers.length) }}
            </template>
            <template #meta>
                <StatusBadge v-if="form.allowedHostnames.length === 0" tone="warning" :label="t('status.anyWebsite')" />
                <StatusBadge v-if="form.receivers.some(needsTemplate)" tone="warning" :label="t('status.noTemplate')" />
                <StatusBadge v-bind="activityBadge(form.isActive)" />
            </template>
        </ListRow>
    </SectionCard>
    <AddInboundFormDialog v-if="canUpdate" v-model="createOpen" :project-id="project.projectId" />
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { mdiFormSelect, mdiPlus } from '@mdi/js'
    import type { ProjectDetailDto } from 'api'
    import EmptyState from '@/components/EmptyState.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import ListRow from '@/components/ListRow.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import ListSkeleton from '@/components/skeletons/ListSkeleton.vue'
    import AddInboundFormDialog from '@/modules/inbound-forms/components/AddInboundFormDialog.vue'
    import { needsTemplate, useReceiverStatus } from '@/modules/inbound-forms/helpers/receiverStatus.ts'
    import { useInboundFormsQuery } from '@/modules/inbound-forms/queries/useInboundFormsQuery.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ project: ProjectDetailDto; canUpdate: boolean }>()

    const { t } = useI18n()
    const { activityBadge } = useReceiverStatus()
    const createOpen = ref(false)
    const {
        data: forms,
        isPending,
        isFetching,
        isError,
        error,
        refetch,
    } = useQuery(useInboundFormsQuery(() => props.project.projectId))
</script>
