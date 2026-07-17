import { ProjectPermission } from '../permission.constants'

export interface ProjectMember {
    projectMemberId: number
    projectId: number
    userId: number
    permission: ProjectPermission
    createdAt: Date
    updatedAt: Date
}

export type ProjectMemberCreate = Omit<ProjectMember, 'projectMemberId' | 'createdAt' | 'updatedAt'>

export interface ProjectMembership {
    projectId: number
    projectName: string
    permissions: ProjectPermission[]
}

export interface ProjectMemberInfo {
    userId: number
    firstName: string
    lastName: string
    email: string
    permissions: ProjectPermission[]
}
