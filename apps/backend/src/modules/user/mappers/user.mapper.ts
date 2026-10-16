import type { Role } from '../../permission/interfaces/role.interface.js'
import type { FullUser, User, UserWithRole } from '../interfaces/user.interface.js'

export function toRole({ roleId, name, scope, type, description, createdAt, updatedAt }: Role): Role {
    return { roleId, name, scope, type, description, createdAt, updatedAt }
}

export function toUser({ userId, firstName, lastName, email, roleId, createdAt, updatedAt }: User): User {
    return { userId, firstName, lastName, email, roleId, createdAt, updatedAt }
}

export function toUserWithRole(user: UserWithRole): UserWithRole {
    return { ...toUser(user), role: toRole(user.role) }
}

export interface UserRow {
    get(options: { plain: true }): FullUser
}

export function userWithRoleFromRow(row: UserRow): UserWithRole {
    return toUserWithRole(row.get({ plain: true }) as FullUser & { role: Role })
}
