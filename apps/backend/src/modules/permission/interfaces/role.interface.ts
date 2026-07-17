import { Permission, RoleType } from '../permission.constants'

export interface Role {
    roleId: number
    name: string
    type: RoleType
    createdAt: Date
    updatedAt: Date
}

export interface RoleWithPermissions extends Role {
    permissions: Permission[]
}

export interface RolePermission {
    rolePermissionId: number
    roleId: number
    permission: Permission
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
