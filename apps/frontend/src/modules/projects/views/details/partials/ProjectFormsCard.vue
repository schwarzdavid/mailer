<template>
    <VCard :title="t('module.projects.details.forms.title')">
        <VCardItem>
            <p v-if="forms && forms.length === 0">{{ t('module.projects.details.forms.empty') }}</p>
            <div class="d-flex flex-column gr-3" v-else>
                <InboundFormListEntry v-for="form in forms" :key="form.inboundFormId" :form="form" />
            </div>
        </VCardItem>
        <VCardActions v-if="canUpdate">
            <VSpacer />
            <AddInboundFormDialog :project-id="project.projectId" v-slot="{ props: activator }">
                <VBtn v-bind="activator" :text="t('cta.add')" />
            </AddInboundFormDialog>
        </VCardActions>
    </VCard>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useQuery } from '@tanstack/vue-query'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { subject } from '@casl/ability'
    import type { ProjectDetailDto } from 'api'
    import { useInboundFormsQuery } from '@/modules/inbound-forms/queries/useInboundFormsQuery.ts'
    import InboundFormListEntry from '@/modules/inbound-forms/views/list/partials/InboundFormListEntry.vue'
    import AddInboundFormDialog from '@/modules/inbound-forms/views/list/partials/AddInboundFormDialog.vue'

    const props = defineProps<{ project: ProjectDetailDto }>()

    const { t } = useI18n()
    const userAbility = useAbility()
    const can = userAbility.can.bind(userAbility)
    const canUpdate = computed(() => can('update', subject('Project', { projectId: props.project.projectId })))
    const { data: forms } = useQuery(useInboundFormsQuery(() => props.project.projectId))
</script>
