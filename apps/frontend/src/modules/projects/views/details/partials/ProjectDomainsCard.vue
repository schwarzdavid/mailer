<template>
    <VCard :title="t('module.projects.details.domains.title')">
        <VCardItem>
            <VAlert v-if="errorMessage" type="error" class="mb-4" :text="errorMessage" />
            <p v-if="project.domains.length === 0">{{ t('module.projects.details.domains.empty') }}</p>
            <VList v-else>
                <VListItem v-for="domain in project.domains" :key="domain.domainId" :title="domain.fqdn">
                    <template v-if="canManageDomains" #append>
                        <VIconBtn
                            icon="mdi-close"
                            :loading="isUnassigning && unassigningId === domain.domainId"
                            @click="unassign(domain.domainId)"
                        />
                    </template>
                </VListItem>
            </VList>
            <div v-if="canManageDomains" class="d-flex gc-3 align-center pt-4">
                <VSelect
                    :items="unassignedDomains"
                    item-title="fqdn"
                    item-value="domainId"
                    v-model="selectedDomainId"
                    :label="t('field.domain')"
                    hide-details
                />
                <VBtn
                    :text="t('module.projects.details.domains.add')"
                    :disabled="selectedDomainId === null"
                    :loading="isAssigning"
                    @click="assign"
                />
            </div>
        </VCardItem>
    </VCard>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import type { ProjectDetailDto } from 'api'
    import { useDomainsQuery } from '@/modules/domains/queries/useDomainsQuery.ts'
    import { useProjectDomainAssignMutation } from '@/modules/projects/mutations/useProjectDomainAssignMutation.ts'
    import { useProjectDomainUnassignMutation } from '@/modules/projects/mutations/useProjectDomainUnassignMutation.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'

    const props = defineProps<{ project: ProjectDetailDto }>()

    const { t } = useI18n()
    const userAbility = useAbility()
    const can = userAbility.can.bind(userAbility)
    const canManageDomains = computed(
        () => can('update', subject('Project', { projectId: props.project.projectId })) && can('read', 'Domain'),
    )
    const domainsQueryOptions = useDomainsQuery()
    const { data: domains } = useQuery({
        queryKey: domainsQueryOptions.queryKey,
        queryFn: domainsQueryOptions.queryFn,
        enabled: canManageDomains,
    })
    const { mutateAsync: assignDomain, isPending: isAssigning } = useProjectDomainAssignMutation()
    const { mutateAsync: unassignDomain, isPending: isUnassigning } = useProjectDomainUnassignMutation()
    const selectedDomainId = ref<number | null>(null)
    const unassigningId = ref<number | null>(null)
    const errorMessage = ref<string | null>(null)

    const unassignedDomains = computed(
        () =>
            domains.value?.filter(
                (domain) => !props.project.domains.some((assigned) => assigned.domainId === domain.domainId),
            ) ?? [],
    )

    async function assign() {
        if (selectedDomainId.value === null) {
            return
        }
        errorMessage.value = null
        try {
            await assignDomain({ projectId: props.project.projectId, domainId: selectedDomainId.value })
            selectedDomainId.value = null
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.details.domains.error'))
        }
    }

    async function unassign(domainId: number) {
        errorMessage.value = null
        unassigningId.value = domainId
        try {
            await unassignDomain({ projectId: props.project.projectId, domainId })
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.details.domains.error'))
        } finally {
            unassigningId.value = null
        }
    }
</script>
