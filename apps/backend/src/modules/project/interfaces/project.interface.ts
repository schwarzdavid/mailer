import { Domain } from '../../domain/interfaces/domain.interface'

export interface Project {
    projectId: number
    name: string
    createdAt: Date
    updatedAt: Date
    deletedAt: Date | null
}

export type ProjectCreate = Omit<Project, 'projectId' | 'createdAt' | 'updatedAt' | 'deletedAt'>

export type DeletedProject = Project & { deletedAt: Date }

export interface ProjectWithCounts extends Project {
    inboundFormCount: number
    domainCount: number
}

export interface ProjectWithDomains extends Project {
    domains: Domain[]
}

export interface ProjectDomain {
    projectDomainId: number
    projectId: number
    domainId: number
    createdAt: Date
    updatedAt: Date
}

export type ProjectDomainCreate = Omit<ProjectDomain, 'projectDomainId' | 'createdAt' | 'updatedAt'>
