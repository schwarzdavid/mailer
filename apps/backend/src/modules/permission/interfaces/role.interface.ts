import { CatalogPermission, Permission, RoleScope, RoleType } from '../permission.constants.js'

export interface Role {
    roleId: number
    name: string
    scope: RoleScope
    type: RoleType
    description: string | null
    createdAt: Date
    updatedAt: Date
}

export interface RoleWithPermissions extends Role {
    permissions: CatalogPermission[]
}

export interface RoleSummary extends RoleWithPermissions {
    assignmentCount: number
}

export interface RoleCreateInput {
    name: string
    scope: RoleScope
    description: string | null
    permissions: CatalogPermission[]
}

export interface RoleUpdateInput {
    name?: string
    description?: string | null
    permissions?: CatalogPermission[]
}

export interface RolePermission {
    rolePermissionId: number
    roleId: number
    permission: CatalogPermission
    createdAt: Date
    updatedAt: Date
}

export type RolePermissionCreate = Omit<RolePermission, 'rolePermissionId' | 'createdAt' | 'updatedAt'>

export interface UserPermission {
    userPermissionId: number
    userId: number
    permission: Permission
    createdAt: Date
    updatedAt: Date
}

export type UserPermissionCreate = Omit<UserPermission, 'userPermissionId' | 'createdAt' | 'updatedAt'>
