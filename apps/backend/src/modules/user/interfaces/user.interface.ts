import { Role } from '../../permission/interfaces/role.interface.js'
import { Permission } from '../../permission/permission.constants.js'
import { ProjectMembership } from '../../permission/interfaces/project-member.interface.js'

export interface User {
    userId: number
    firstName: string
    lastName: string
    email: string
    roleId: number
    createdAt: Date
    updatedAt: Date
}

export interface FullUser extends User {
    password: string
}

export interface UserWithRole extends User {
    role: Role
}

export type UserCreate = Omit<FullUser, 'userId' | 'createdAt' | 'updatedAt'>

export type ManagedUserCreate = UserCreate & { permissions: Permission[] }

export interface UserUpdate {
    firstName?: string
    lastName?: string
    email?: string
    password?: string
    roleId?: number
}

export interface UserListEntry extends UserWithRole {
    membershipCount: number
    allProjects: boolean
}

export interface UserDetail extends UserWithRole {
    permissions: Permission[]
    memberships: ProjectMembership[]
}
