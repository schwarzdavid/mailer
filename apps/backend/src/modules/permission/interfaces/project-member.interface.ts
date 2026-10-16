import { ProjectPermission } from '../permission.constants.js'

export interface ProjectMember {
    projectMemberId: number
    projectId: number
    userId: number
    roleId: number
    createdAt: Date
    updatedAt: Date
}

export type ProjectMemberCreate = Omit<ProjectMember, 'projectMemberId' | 'createdAt' | 'updatedAt'>

export interface ProjectMemberPermission {
    projectMemberPermissionId: number
    projectMemberId: number
    permission: ProjectPermission
    createdAt: Date
    updatedAt: Date
}

export type ProjectMemberPermissionCreate = Omit<
    ProjectMemberPermission,
    'projectMemberPermissionId' | 'createdAt' | 'updatedAt'
>

export interface ProjectMemberRole {
    roleId: number
    name: string
}

export interface ProjectMemberGrant {
    roleId: number
    permissions: ProjectPermission[]
}

export interface ProjectMembership {
    projectId: number
    projectName: string
    role: ProjectMemberRole
    permissions: ProjectPermission[]
}

export interface ProjectMemberInfo {
    userId: number
    firstName: string
    lastName: string
    email: string
    role: ProjectMemberRole
    permissions: ProjectPermission[]
}
