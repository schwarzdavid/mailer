import { AbilityAction, AbilitySubjectName } from './interfaces/app-ability.js'

export const GLOBAL_PERMISSIONS = [
    'domains.read',
    'domains.create',
    'domains.update',
    'domains.delete',
    'projects.create',
    'projects.all',
    'bounces.read',
    'bounces.block',
    'bounces.unblock',
    'settings.read',
    'settings.update',
    'users.read',
    'users.create',
    'users.update',
    'users.delete',
    'roles.read',
    'roles.create',
    'roles.update',
    'roles.delete',
] as const

export type Permission = (typeof GLOBAL_PERMISSIONS)[number]

export const PROJECT_PERMISSIONS = [
    'read',
    'update',
    'delete',
    'forms.manage',
    'api_keys.manage',
    'members.manage',
] as const

export type ProjectPermission = (typeof PROJECT_PERMISSIONS)[number]

export const PROJECT_ROLE_REQUIRED_PERMISSION: ProjectPermission = 'read'

export const CATALOG_PERMISSIONS = [...GLOBAL_PERMISSIONS, ...PROJECT_PERMISSIONS] as const

export type CatalogPermission = Permission | ProjectPermission

export const ROLE_SCOPES = ['global', 'project'] as const

export type RoleScope = (typeof ROLE_SCOPES)[number]

export const ROLE_TYPES = ['super_admin', 'admin', 'user', 'custom'] as const

export type RoleType = (typeof ROLE_TYPES)[number]

const GLOBAL_PERMISSION_SET: ReadonlySet<string> = new Set(GLOBAL_PERMISSIONS)
const PROJECT_PERMISSION_SET: ReadonlySet<string> = new Set(PROJECT_PERMISSIONS)

export function isGlobalPermission(value: string): value is Permission {
    return GLOBAL_PERMISSION_SET.has(value)
}

export function isProjectPermission(value: string): value is ProjectPermission {
    return PROJECT_PERMISSION_SET.has(value)
}

export function permissionsForScope(scope: RoleScope): readonly CatalogPermission[] {
    return scope === 'global' ? GLOBAL_PERMISSIONS : PROJECT_PERMISSIONS
}

export const GLOBAL_PERMISSION_ABILITIES: Record<
    Permission,
    readonly (readonly [AbilityAction, AbilitySubjectName])[]
> = {
    'domains.read': [['read', 'Domain']],
    'domains.create': [['create', 'Domain']],
    'domains.update': [['update', 'Domain']],
    'domains.delete': [['delete', 'Domain']],
    'projects.create': [['create', 'Project']],
    'projects.all': PROJECT_PERMISSIONS.map((permission) => [permission, 'Project'] as const),
    'bounces.read': [['read', 'Bounce']],
    'bounces.block': [['block', 'Bounce']],
    'bounces.unblock': [['unblock', 'Bounce']],
    'settings.read': [['read', 'Settings']],
    'settings.update': [['update', 'Settings']],
    'users.read': [['read', 'User']],
    'users.create': [['create', 'User']],
    'users.update': [['update', 'User']],
    'users.delete': [['delete', 'User']],
    'roles.read': [['read', 'Role']],
    'roles.create': [['create', 'Role']],
    'roles.update': [['update', 'Role']],
    'roles.delete': [['delete', 'Role']],
}

export const AUTH_USER_CACHE_PREFIX = 'auth:user:'

export const AUTH_PERMISSIONS_CACHE_PREFIX = 'auth:permissions:v2:'
