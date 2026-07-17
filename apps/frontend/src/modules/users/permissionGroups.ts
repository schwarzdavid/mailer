import type { Permission } from 'api'

export const PERMISSION_GROUPS: Record<string, Permission[]> = {
    domains: ['domains.read', 'domains.create', 'domains.update', 'domains.delete'],
    projects: ['projects.create', 'projects.all'],
    bounces: ['bounces.read', 'bounces.block', 'bounces.unblock'],
    settings: ['settings.read', 'settings.update'],
    users: ['users.read', 'users.create', 'users.update', 'users.delete'],
    roles: ['roles.read'],
}
