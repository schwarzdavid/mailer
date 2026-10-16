import type { ProjectPermission } from 'api'

export const PROJECT_PERMISSIONS: ProjectPermission[] = [
    'read',
    'update',
    'delete',
    'forms.manage',
    'api_keys.manage',
    'members.manage',
]

export function sortedPermissions(permissions: ProjectPermission[]): ProjectPermission[] {
    return PROJECT_PERMISSIONS.filter((permission) => permissions.includes(permission))
}
