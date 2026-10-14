import { useI18n } from 'vue-i18n'

export interface ProjectCounts {
    forms?: number
    domains?: number
    members?: number
}

export function useProjectCountParts() {
    const { t } = useI18n()

    return (counts: ProjectCounts) => {
        const parts: string[] = []
        if (counts.forms !== undefined) {
            parts.push(t('module.projects.counts.forms', { count: counts.forms }, counts.forms))
        }
        if (counts.domains !== undefined) {
            parts.push(t('module.projects.counts.domains', { count: counts.domains }, counts.domains))
        }
        if (counts.members !== undefined) {
            parts.push(t('module.projects.counts.members', { count: counts.members }, counts.members))
        }
        return parts
    }
}

export function useProjectCounts() {
    const parts = useProjectCountParts()

    return (counts: ProjectCounts) => parts(counts).join(' · ')
}
