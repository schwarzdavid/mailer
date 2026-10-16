import { ForbiddenException } from '@nestjs/common'

export function assertPermissionChangesHeld<T extends string>(
    current: readonly T[],
    requested: readonly T[],
    isHeld: (permission: T) => boolean,
): void {
    const changed = [
        ...requested.filter((permission) => !current.includes(permission)),
        ...current.filter((permission) => !requested.includes(permission)),
    ]
    const notHeld = [...new Set(changed.filter((permission) => !isHeld(permission)))].sort()

    if (notHeld.length > 0) {
        throw new ForbiddenException(`You cannot grant or revoke permissions you do not hold: ${notHeld.join(', ')}`)
    }
}

export function assertRoleGrantable<T extends string>(
    permissions: readonly T[],
    isHeld: (permission: T) => boolean,
): void {
    const notHeld = [...new Set(permissions.filter((permission) => !isHeld(permission)))].sort()

    if (notHeld.length > 0) {
        throw new ForbiddenException(`You cannot assign a role with permissions you do not hold: ${notHeld.join(', ')}`)
    }
}
