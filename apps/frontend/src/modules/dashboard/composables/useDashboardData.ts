import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useAbility } from '@casl/vue'
import { useBouncesQuery } from '@/modules/bounces/queries/useBouncesQuery.ts'
import { isDomainValid } from '@/modules/domains/helpers/domainStatus.ts'
import { useDomainsQuery } from '@/modules/domains/queries/useDomainsQuery.ts'
import { useAllInboundFormsQuery } from '@/modules/inbound-forms/queries/useAllInboundFormsQuery.ts'
import { useDeletedProjectsQuery } from '@/modules/projects/queries/useDeletedProjectsQuery.ts'
import { useProjectsQuery } from '@/modules/projects/queries/useProjectsQuery.ts'
import { useSendingDomainHealth } from '@/modules/settings/composables/useSendingDomainHealth.ts'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function weekAgo() {
    const date = new Date(Date.now() - WEEK_MS)
    date.setSeconds(0, 0)
    return date
}

export function useDashboardData() {
    const userAbility = useAbility()
    const canReadDomains = computed(() => userAbility.can('read', 'Domain'))
    const canReadBounces = computed(() => userAbility.can('read', 'Bounce'))
    const since = weekAgo()

    const projects = useQuery(useProjectsQuery())
    const deletedProjects = useQuery(useDeletedProjectsQuery())
    const forms = useQuery(useAllInboundFormsQuery())

    const domainsOptions = useDomainsQuery()
    const domains = useQuery({
        queryKey: domainsOptions.queryKey,
        queryFn: domainsOptions.queryFn,
        enabled: canReadDomains,
    })

    const weekOptions = useBouncesQuery({ receivedAfter: since, itemsPerPage: 1 })
    const weekBounces = useQuery({
        queryKey: weekOptions.queryKey,
        queryFn: weekOptions.queryFn,
        enabled: canReadBounces,
    })
    const permanentOptions = useBouncesQuery({ receivedAfter: since, type: 'permanent', itemsPerPage: 1 })
    const permanentBounces = useQuery({
        queryKey: permanentOptions.queryKey,
        queryFn: permanentOptions.queryFn,
        enabled: canReadBounces,
    })
    const recentOptions = useBouncesQuery({ itemsPerPage: 4 })
    const recentBounces = useQuery({
        queryKey: recentOptions.queryKey,
        queryFn: recentOptions.queryFn,
        enabled: canReadBounces,
    })

    const health = useSendingDomainHealth()

    const projectNames = computed(
        () => new Map((projects.data.value ?? []).map((project) => [project.projectId, project.name] as const)),
    )

    const domainProjects = computed(() => {
        const result = new Map<number, Set<string>>()
        for (const form of forms.data.value ?? []) {
            if (form.domainId === null) {
                continue
            }
            const names = result.get(form.domainId) ?? new Set<string>()
            const name = projectNames.value.get(form.projectId)
            if (name) {
                names.add(name)
            }
            result.set(form.domainId, names)
        }
        return result
    })

    const validDomains = computed(() => (domains.data.value ?? []).filter(isDomainValid))
    const invalidDomains = computed(() => (domains.data.value ?? []).filter((domain) => !isDomainValid(domain)))

    return {
        canReadDomains,
        canReadBounces,
        projects,
        deletedProjects,
        forms,
        domains,
        weekBounces,
        permanentBounces,
        recentBounces,
        health,
        projectNames,
        domainProjects,
        validDomains,
        invalidDomains,
    }
}
