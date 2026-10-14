<template>
    <SectionCard
        :title="t('module.projects.details.domains.title')"
        :description="t('module.projects.details.domains.description')"
        :count="visibleDomains.length"
        flush
    >
        <template v-if="canUpdate" #actions>
            <VBtn
                size="small"
                :prepend-icon="mdiPlus"
                :text="t('module.projects.details.domains.assign')"
                @click="assignOpen = true"
            />
        </template>
        <div v-if="visibleDomains.length === 0" class="project-domains__empty">
            <InlineAlert
                tone="warning"
                :title="t('module.projects.details.domains.empty.title')"
                :text="t('module.projects.details.domains.empty.text')"
            />
        </div>
        <ListRow v-for="domain in visibleDomains" :key="domain.domainId" :icon="mdiWeb" :title="domain.fqdn" mono-title>
            <template #subtitle>
                <template v-if="domainStatus.invalidSummary(domainRecords(domain))">
                    {{ domainStatus.invalidSummary(domainRecords(domain)) }}
                    <span class="row-sep">·</span>
                </template>
                <RouterLink
                    :to="{ name: RouteNames.DOMAIN_DETAILS, params: { domainId: domain.domainId } }"
                    class="row-link"
                >
                    {{ t('module.projects.details.domains.viewRecords') }}
                </RouterLink>
            </template>
            <template #meta>
                <StatusBadge v-bind="domainStatus.domainBadge(domain)" />
            </template>
            <template v-if="canUpdate" #actions>
                <IconButton
                    :icon="mdiLinkVariantOff"
                    :label="t('module.projects.details.domains.unassign', { domain: domain.fqdn })"
                    danger
                    @click="unassign(domain)"
                />
            </template>
        </ListRow>
    </SectionCard>
    <AssignDomainDialog v-if="canUpdate" v-model="assignOpen" :project="project" />
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { mdiLinkVariantOff, mdiPlus, mdiWeb } from '@mdi/js'
    import type { DomainDto, ProjectDetailDto } from 'api'
    import IconButton from '@/components/IconButton.vue'
    import InlineAlert from '@/components/InlineAlert.vue'
    import ListRow from '@/components/ListRow.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import { useUndoRemove } from '@/composables/useUndoRemove.ts'
    import { domainRecords, useDomainStatus } from '@/modules/domains/helpers/domainStatus.ts'
    import { useProjectDomainUnassignMutation } from '@/modules/projects/mutations/useProjectDomainUnassignMutation.ts'
    import AssignDomainDialog from '@/modules/projects/views/details/partials/AssignDomainDialog.vue'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ project: ProjectDetailDto; canUpdate: boolean }>()

    const { t } = useI18n()
    const domainStatus = useDomainStatus()
    const assignOpen = ref(false)
    const { mutateAsync: unassignDomain } = useProjectDomainUnassignMutation()
    const { remove, isHidden } = useUndoRemove<number>()

    const visibleDomains = computed(() => props.project.domains.filter((domain) => !isHidden(domain.domainId)))

    function unassign(domain: DomainDto) {
        remove(domain.domainId, {
            text: t('module.projects.details.domains.unassigned', { domain: domain.fqdn }),
            errorText: t('module.projects.details.domains.unassignError', { domain: domain.fqdn }),
            commit: () => unassignDomain({ projectId: props.project.projectId, domainId: domain.domainId }),
        })
    }
</script>

<style scoped>
    .project-domains__empty {
        padding: 4px 24px 16px;
    }

    @media (max-width: 599.98px) {
        .project-domains__empty {
            padding: 4px 16px 16px;
        }
    }
</style>
