import type { AuthPermissionsDto, Permission, ProjectPermission, RoleDto } from 'api'
import { roles as globalRoles } from '@/modules/users/views/__tests__/userFixtures.ts'
import { projectRoles } from '@/__tests__/fixtures.ts'

export { globalRoles }

export const ALL_PERMISSIONS: Permission[] = [
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
]

export const ALL_PROJECT_PERMISSIONS: ProjectPermission[] = [
    'read',
    'update',
    'delete',
    'forms.manage',
    'api_keys.manage',
    'members.manage',
]

export function projectRoleSummaries(): RoleDto[] {
    return projectRoles().map((role, index) => ({
        ...role,
        scope: 'project',
        type: 'custom',
        assignmentCount: index,
    }))
}

export function allRoles(): RoleDto[] {
    return [...globalRoles, ...projectRoleSummaries()]
}

export function heldAll(): AuthPermissionsDto {
    return { permissions: ALL_PERMISSIONS, projectPermissions: ALL_PROJECT_PERMISSIONS }
}

export function heldNone(): AuthPermissionsDto {
    return { permissions: [], projectPermissions: [] }
}

export function heldOnly(permissions: Permission[], projectPermissions: ProjectPermission[] = []): AuthPermissionsDto {
    return { permissions, projectPermissions }
}
