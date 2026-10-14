<template>
    <SectionCard
        :title="t('module.projects.apiKeys.title')"
        :description="t('module.projects.apiKeys.description')"
        :count="activeCount"
        :refetching="isFetching && !isPending"
        flush
    >
        <template v-if="canUpdate" #actions>
            <VBtn
                size="small"
                :prepend-icon="mdiPlus"
                :text="t('module.projects.apiKeys.add')"
                @click="createOpen = true"
            />
        </template>
        <ListSkeleton v-if="isPending" :rows="2" />
        <ErrorState v-else-if="isError" :thing="t('module.projects.apiKeys.thing')" :error="error" @retry="refetch()" />
        <EmptyState
            v-else-if="sortedKeys.length === 0"
            :icon="mdiKeyOutline"
            :title="t('module.projects.apiKeys.empty.title')"
            :text="
                canUpdate ? t('module.projects.apiKeys.empty.text') : t('module.projects.apiKeys.empty.textReadOnly')
            "
        />
        <VExpandTransition v-else group>
            <ListRow
                v-for="key in sortedKeys"
                :key="key.apiKeyId"
                :title="key.name"
                :icon="mdiKeyVariant"
                :lead-tone="key.revokedAt ? 'none' : 'neutral'"
            >
                <template #subtitle>
                    <i18n-t keypath="module.projects.apiKeys.prefix" tag="span">
                        <template #prefix>
                            <span class="mono">{{ key.prefix }}</span>
                        </template>
                    </i18n-t>
                </template>
                <template #meta>
                    <StatusBadge v-if="key.revokedAt" tone="neutral" :label="t('module.projects.apiKeys.revoked')" />
                    <i18n-t
                        v-else-if="key.lastUsedAt"
                        keypath="module.projects.apiKeys.lastUsed"
                        tag="span"
                        class="text-ink-muted"
                    >
                        <template #time><RelativeTime :value="key.lastUsedAt" /></template>
                    </i18n-t>
                    <span v-else class="text-ink-muted">{{ t('module.projects.apiKeys.neverUsed') }}</span>
                </template>
                <template v-if="canUpdate && !key.revokedAt" #actions>
                    <IconButton
                        :icon="mdiKeyRemove"
                        :label="t('module.projects.apiKeys.revokeLabel', { name: key.name })"
                        danger
                        @click="revoke(key)"
                    />
                </template>
            </ListRow>
        </VExpandTransition>
    </SectionCard>
    <ApiKeyCreateDialog v-if="canUpdate" v-model="createOpen" :project="project" @created="onCreated" />
    <ApiKeyRevealDialog v-model="revealOpen" :api-key="createdKey" />
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { mdiKeyOutline, mdiKeyRemove, mdiKeyVariant, mdiPlus } from '@mdi/js'
    import type { ApiKeyCreatedDto, ApiKeyDto, ProjectDetailDto } from 'api'
    import EmptyState from '@/components/EmptyState.vue'
    import ErrorState from '@/components/ErrorState.vue'
    import IconButton from '@/components/IconButton.vue'
    import ListRow from '@/components/ListRow.vue'
    import RelativeTime from '@/components/RelativeTime.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import ListSkeleton from '@/components/skeletons/ListSkeleton.vue'
    import { useConfirm } from '@/composables/useConfirm.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useApiKeysQuery } from '@/modules/projects/queries/useApiKeysQuery.ts'
    import { useApiKeyRevokeMutation } from '@/modules/projects/mutations/useApiKeyRevokeMutation.ts'
    import ApiKeyCreateDialog from '@/modules/projects/views/details/partials/ApiKeyCreateDialog.vue'
    import ApiKeyRevealDialog from '@/modules/projects/views/details/partials/ApiKeyRevealDialog.vue'

    const props = defineProps<{ project: ProjectDetailDto; canUpdate: boolean }>()

    const { t } = useI18n()
    const confirm = useConfirm()
    const notify = useNotify()

    const {
        data: keys,
        isPending,
        isFetching,
        isError,
        error,
        refetch,
    } = useQuery(useApiKeysQuery(() => props.project.projectId))
    const { mutateAsync: revokeRequest } = useApiKeyRevokeMutation()

    const createOpen = ref(false)
    const revealOpen = ref(false)
    const createdKey = ref<ApiKeyCreatedDto | null>(null)

    const sortedKeys = computed(() =>
        [...(keys.value ?? [])].sort(
            (a, b) => Number(a.revokedAt !== null) - Number(b.revokedAt !== null) || b.apiKeyId - a.apiKeyId,
        ),
    )
    const activeCount = computed(() => sortedKeys.value.filter((key) => !key.revokedAt).length)

    watch(revealOpen, (open) => {
        if (!open) {
            createdKey.value = null
        }
    })

    function onCreated(created: ApiKeyCreatedDto) {
        createdKey.value = created
        revealOpen.value = true
        notify.success(t('module.projects.apiKeys.created', { name: created.name }))
    }

    async function revoke(key: ApiKeyDto) {
        const confirmed = await confirm({
            title: t('module.projects.apiKeys.confirmTitle', { name: key.name }),
            body: t('module.projects.apiKeys.confirmBody'),
            confirmLabel: t('module.projects.apiKeys.confirm'),
            destructive: true,
            errorText: t('module.projects.apiKeys.revokeError', { name: key.name }),
            action: () => revokeRequest({ projectId: props.project.projectId, apiKeyId: key.apiKeyId }),
        })
        if (confirmed) {
            notify.success(t('module.projects.apiKeys.revokedDone', { name: key.name }))
        }
    }
</script>
