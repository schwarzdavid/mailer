import type { DomainDto, ProjectDetailDto } from 'api'

export function soleProjectDomain(project: ProjectDetailDto | undefined): DomainDto | null {
    return project?.domains.length === 1 ? project.domains[0]! : null
}
