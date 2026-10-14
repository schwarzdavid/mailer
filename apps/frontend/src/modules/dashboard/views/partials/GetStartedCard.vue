<template>
    <SectionCard
        :title="t('module.dashboard.getStarted.title')"
        :description="t('module.dashboard.getStarted.description', { done: steps.doneCount.value })"
        flush
    >
        <ol class="get-started">
            <li
                v-for="(step, index) in STEPS"
                :key="step"
                class="get-started__step"
                :class="{
                    'get-started__step--done': steps.done.value[step],
                    'get-started__step--current': steps.current.value === step,
                }"
                :aria-current="steps.current.value === step ? 'step' : undefined"
            >
                <span class="get-started__mark">
                    <VIcon v-if="steps.done.value[step]" :icon="mdiCheck" size="16" />
                    <template v-else>{{ index + 1 }}</template>
                </span>
                <span>
                    <span class="get-started__title">{{ t(`module.dashboard.getStarted.steps.${step}.title`) }}</span>
                    <span class="get-started__text">{{ t(`module.dashboard.getStarted.steps.${step}.text`) }}</span>
                </span>
                <span v-if="!steps.done.value[step] && actions[step]" class="get-started__action">
                    <VBtn
                        :variant="steps.current.value === step ? 'flat' : 'text'"
                        :color="steps.current.value === step ? 'primary' : undefined"
                        size="small"
                        :text="actions[step]!.label"
                        :to="actions[step]!.to"
                    />
                </span>
            </li>
        </ol>
    </SectionCard>
</template>

<script setup lang="ts">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { useAbility } from '@casl/vue'
    import { mdiCheck } from '@mdi/js'
    import type { RouteLocationRaw } from 'vue-router'
    import SectionCard from '@/components/SectionCard.vue'
    import type { useDashboardData } from '@/modules/dashboard/composables/useDashboardData.ts'
    import { useGetStartedSteps, type GetStartedStepKey } from '@/modules/dashboard/composables/useGetStartedSteps.ts'
    import { RouteNames } from '@/router/RouteNames.ts'

    const STEPS: GetStartedStepKey[] = ['domain', 'project', 'form', 'template']

    const props = defineProps<{ data: ReturnType<typeof useDashboardData> }>()

    const { t } = useI18n()
    const userAbility = useAbility()
    const steps = useGetStartedSteps(props.data)

    const firstForm = computed(() => props.data.forms.data.value?.[0])
    const firstProject = computed(() => props.data.projects.data.value?.[0])

    const actions = computed<Partial<Record<GetStartedStepKey, { label: string; to: RouteLocationRaw }>>>(() => ({
        domain: userAbility.can('create', 'Domain')
            ? { label: t('module.domains.list.create'), to: { name: RouteNames.DOMAIN_LIST } }
            : undefined,
        project: { label: t('module.projects.list.create'), to: { name: RouteNames.PROJECT_LIST } },
        form: firstProject.value
            ? {
                  label: t('module.dashboard.getStarted.openProject'),
                  to: { name: RouteNames.PROJECT_DETAILS, params: { projectId: firstProject.value.projectId } },
              }
            : undefined,
        template: firstForm.value
            ? {
                  label: t('module.dashboard.getStarted.openForm'),
                  to: {
                      name: RouteNames.INBOUND_FORM_DETAILS,
                      params: { inboundFormId: firstForm.value.inboundFormId },
                  },
              }
            : undefined,
    }))
</script>

<style scoped>
    .get-started {
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .get-started__step {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr) auto;
        gap: 12px;
        align-items: start;
        padding: 16px 24px;
        border-top: 1px solid rgb(var(--v-theme-border));
    }

    .get-started__step:first-child {
        border-top: 0;
    }

    .get-started__step--current {
        background: rgb(var(--v-theme-primary-container));
    }

    .get-started__mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        margin-top: -2px;
        border: 1.5px solid rgb(var(--v-theme-border-strong));
        border-radius: 9999px;
        color: rgb(var(--v-theme-ink-muted));
        font-size: 0.75rem;
        font-weight: 600;
    }

    .get-started__step--done .get-started__mark {
        border-color: rgb(var(--v-theme-ink));
        background: rgb(var(--v-theme-ink));
        color: rgb(var(--v-theme-surface));
    }

    .get-started__step--current .get-started__mark {
        border-color: rgb(var(--v-theme-on-primary-container));
        color: rgb(var(--v-theme-on-primary-container));
    }

    .get-started__title {
        display: block;
        font-weight: 600;
    }

    .get-started__step--done .get-started__title {
        color: rgb(var(--v-theme-ink-muted));
        text-decoration: line-through;
        text-decoration-color: rgb(var(--v-theme-border-strong));
    }

    .get-started__text {
        display: block;
        margin-top: 2px;
        color: rgb(var(--v-theme-ink-muted));
    }

    .get-started__action {
        align-self: center;
    }

    @media (max-width: 599.98px) {
        .get-started__step {
            grid-template-columns: 28px minmax(0, 1fr);
            padding: 16px;
        }

        .get-started__action {
            grid-column: 2;
        }
    }
</style>
