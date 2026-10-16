import type { Permission, ProjectPermission, RoleScope } from 'api'

export const GLOBAL_PERMISSION_GROUPS: Record<string, Permission[]> = {
    domains: ['domains.read', 'domains.create', 'domains.update', 'domains.delete'],
    projects: ['projects.create', 'projects.all'],
    bounces: ['bounces.read', 'bounces.block', 'bounces.unblock'],
    settings: ['settings.read', 'settings.update'],
    users: ['users.read', 'users.create', 'users.update', 'users.delete'],
    roles: ['roles.read', 'roles.create', 'roles.update', 'roles.delete'],
}

export const PROJECT_PERMISSION_GROUPS: Record<string, ProjectPermission[]> = {
    project: ['read', 'update', 'delete'],
    content: ['forms.manage', 'api_keys.manage'],
    members: ['members.manage'],
}

const GLOBAL_PERMISSION_SET = new Set<string>(Object.values(GLOBAL_PERMISSION_GROUPS).flat())
const PROJECT_PERMISSION_SET = new Set<string>(Object.values(PROJECT_PERMISSION_GROUPS).flat())

export function isGlobalPermission(value: string): value is Permission {
    return GLOBAL_PERMISSION_SET.has(value)
}

export function isProjectPermission(value: string): value is ProjectPermission {
    return PROJECT_PERMISSION_SET.has(value)
}

export function permissionLabelKey(scope: RoleScope, permission: string): string {
    return `permissions.${scope === 'global' ? 'labels' : 'project'}.${permission.replace('.', '_')}`
}
