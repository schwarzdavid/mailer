import { AppAbility } from '../interfaces/app-ability.js'
import { GLOBAL_PERMISSION_ABILITIES, Permission } from '../permission.constants.js'

export function holdsPermission(ability: AppAbility, permission: Permission): boolean {
    return GLOBAL_PERMISSION_ABILITIES[permission].every(([action, subjectName]) =>
        ability.rulesFor(action, subjectName).some((rule) => !rule.inverted && rule.conditions === undefined),
    )
}
