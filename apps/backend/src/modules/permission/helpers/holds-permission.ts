import { AbilityAction, AbilitySubjectName, AppAbility } from '../interfaces/app-ability.js'
import {
    CatalogPermission,
    GLOBAL_PERMISSION_ABILITIES,
    GLOBAL_PERMISSIONS,
    isGlobalPermission,
    isProjectPermission,
    Permission,
    PROJECT_PERMISSIONS,
    ProjectPermission,
    RoleScope,
} from '../permission.constants.js'

function holdsUnconditionally(ability: AppAbility, action: AbilityAction, subjectName: AbilitySubjectName): boolean {
    return ability.rulesFor(action, subjectName).some((rule) => !rule.inverted && rule.conditions === undefined)
}

export function holdsPermission(ability: AppAbility, permission: Permission): boolean {
    return GLOBAL_PERMISSION_ABILITIES[permission].every(([action, subjectName]) =>
        holdsUnconditionally(ability, action, subjectName),
    )
}

export function holdsProjectPermissionEverywhere(ability: AppAbility, permission: ProjectPermission): boolean {
    return holdsUnconditionally(ability, permission, 'Project')
}

export function heldPermissions(ability: AppAbility): Permission[] {
    return GLOBAL_PERMISSIONS.filter((permission) => holdsPermission(ability, permission))
}

export function heldProjectPermissionsEverywhere(ability: AppAbility): ProjectPermission[] {
    return PROJECT_PERMISSIONS.filter((permission) => holdsProjectPermissionEverywhere(ability, permission))
}

export function holdsRolePermission(ability: AppAbility, scope: RoleScope, permission: CatalogPermission): boolean {
    if (scope === 'global') {
        return isGlobalPermission(permission) && holdsPermission(ability, permission)
    }

    return isProjectPermission(permission) && holdsProjectPermissionEverywhere(ability, permission)
}
