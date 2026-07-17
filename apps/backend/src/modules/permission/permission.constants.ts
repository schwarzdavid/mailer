import { AbilityAction, AbilitySubjectName } from './interfaces/app-ability'

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
] as const

export type Permission = (typeof GLOBAL_PERMISSIONS)[number]

export const PROJECT_PERMISSIONS = ['read', 'update', 'delete'] as const

export type ProjectPermission = (typeof PROJECT_PERMISSIONS)[number]

export const ROLE_TYPES = ['super_admin', 'admin', 'user', 'custom'] as const

export type RoleType = (typeof ROLE_TYPES)[number]

export const GLOBAL_PERMISSION_ABILITIES: Record<
    Permission,
    readonly (readonly [AbilityAction, AbilitySubjectName])[]
> = {
    'domains.read': [['read', 'Domain']],
    'domains.create': [['create', 'Domain']],
    'domains.update': [['update', 'Domain']],
    'domains.delete': [['delete', 'Domain']],
    'projects.create': [['create', 'Project']],
    'projects.all': [
        ['read', 'Project'],
        ['update', 'Project'],
        ['delete', 'Project'],
    ],
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
}

export const AUTH_USER_CACHE_PREFIX = 'auth:user:'

export const AUTH_PERMISSIONS_CACHE_PREFIX = 'auth:permissions:'
