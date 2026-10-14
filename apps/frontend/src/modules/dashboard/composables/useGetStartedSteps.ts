import { computed } from 'vue'
import { useAbility } from '@casl/vue'
import type { useDashboardData } from '@/modules/dashboard/composables/useDashboardData.ts'

export type GetStartedStepKey = 'domain' | 'project' | 'form' | 'template'

export function useGetStartedSteps(data: ReturnType<typeof useDashboardData>) {
    const userAbility = useAbility()

    const loaded = computed(
        () =>
            data.projects.isSuccess.value &&
            data.forms.isSuccess.value &&
            (!data.canReadDomains.value || data.domains.isSuccess.value),
    )

    const done = computed<Record<GetStartedStepKey, boolean>>(() => {
        const forms = data.forms.data.value ?? []
        return {
            domain: data.validDomains.value.length > 0 || forms.some((form) => form.domainId !== null),
            project: (data.projects.data.value?.length ?? 0) > 0,
            form: forms.some((form) => form.receivers.length > 0),
            template: forms.some((form) => form.receivers.some((receiver) => receiver.publishedVersion !== null)),
        }
    })

    const doneCount = computed(() => Object.values(done.value).filter(Boolean).length)
    const current = computed(() => (['domain', 'project', 'form', 'template'] as const).find((key) => !done.value[key]))

    const visible = computed(() => loaded.value && current.value !== undefined && userAbility.can('create', 'Project'))

    return { done, doneCount, current, visible }
}
