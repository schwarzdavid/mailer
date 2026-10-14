<template>
    <FormDialog
        v-model="model"
        :title="t('module.projects.details.domains.dialog.title')"
        :submit-label="t('module.projects.details.domains.dialog.submit')"
        :pending="isPending"
        :error="errorMessage"
        @submit="onSubmit"
    >
        <p>{{ t('module.projects.details.domains.dialog.intro', { project: project.name }) }}</p>
        <VSelect
            v-model="domainId"
            name="domainId"
            class="mono-field"
            :label="requiredLabel(t('module.projects.details.domains.dialog.field'))"
            :items="options"
            item-title="fqdn"
            item-value="domainId"
            :loading="isLoading"
            :error-messages="fieldError"
            aria-required="true"
        >
            <template #item="{ props: itemProps, item }">
                <VListItem v-bind="itemProps">
                    <template v-if="!item.valid" #append>
                        <StatusBadge tone="warning" :label="t('status.invalid')" />
                    </template>
                </VListItem>
            </template>
        </VSelect>
        <p class="assign-domain__hint">
            {{ t('module.projects.details.domains.dialog.hint') }}
            <RouterLink v-if="canCreateDomain" :to="{ name: RouteNames.DOMAIN_LIST }">
                {{ t('module.projects.details.domains.dialog.addDomain') }}
            </RouterLink>
        </p>
    </FormDialog>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import type { ProjectDetailDto } from 'api'
    import FormDialog from '@/components/FormDialog.vue'
    import StatusBadge from '@/components/StatusBadge.vue'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import { isDomainValid } from '@/modules/domains/helpers/domainStatus.ts'
    import { useDomainsQuery } from '@/modules/domains/queries/useDomainsQuery.ts'
    import { useProjectDomainAssignMutation } from '@/modules/projects/mutations/useProjectDomainAssignMutation.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const props = defineProps<{ project: ProjectDetailDto }>()
    const model = defineModel<boolean>({ required: true })

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const notify = useNotify()
    const userAbility = useAbility()
    const { queryKey, queryFn } = useDomainsQuery()
    const { data: domains, isLoading } = useQuery({ queryKey, queryFn, enabled: model })
    const { mutateAsync, isPending } = useProjectDomainAssignMutation()
    const domainId = ref<number | null>(null)
    const fieldError = ref<string | undefined>()
    const errorMessage = ref<string | null>(null)

    const canCreateDomain = computed(() => userAbility.can('create', 'Domain'))

    const options = computed(() =>
        (domains.value ?? [])
            .filter((domain) => !props.project.domains.some((assigned) => assigned.domainId === domain.domainId))
            .map((domain) => ({
                domainId: domain.domainId,
                fqdn: domain.fqdn,
                valid: isDomainValid(domain),
            }))
            .sort((a, b) => Number(b.valid) - Number(a.valid)),
    )

    watch(
        model,
        (open) => {
            if (open) {
                domainId.value = null
                fieldError.value = undefined
                errorMessage.value = null
            }
        },
        { immediate: true },
    )

    async function onSubmit() {
        fieldError.value = undefined
        errorMessage.value = null
        const selected = options.value.find((option) => option.domainId === domainId.value)
        if (!selected) {
            fieldError.value = t('module.projects.details.domains.dialog.required')
            return
        }
        try {
            await mutateAsync({ projectId: props.project.projectId, domainId: selected.domainId })
            model.value = false
            notify.success(t('module.projects.details.domains.assigned', { domain: selected.fqdn }))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('module.projects.details.domains.assignError'))
        }
    }
</script>

<style scoped>
    .assign-domain__hint {
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        line-height: 1rem;
    }

    .assign-domain__hint a {
        color: rgb(var(--v-theme-ink));
        font-weight: 500;
    }
</style>
