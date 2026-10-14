import type { RoleDto, UserDetailDto, UserDto } from 'api'

const created = new Date('2026-01-01T00:00:00.000Z')

export const roles: RoleDto[] = [
    { roleId: 1, type: 'super_admin', name: 'Super Admin', permissions: [] },
    { roleId: 2, type: 'admin', name: 'Admin', permissions: ['domains.read', 'projects.all'] },
    { roleId: 3, type: 'user', name: 'User', permissions: [] },
]

export function signedIn(type: UserDto['role']['type'] = 'super_admin', userId = 1): UserDto {
    const role = roles.find((candidate) => candidate.type === type)!
    return {
        userId,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@acme.com',
        role: { roleId: role.roleId, type: role.type, name: role.name },
        createdAt: created,
        updatedAt: created,
    }
}

export function userDetail(overrides: Partial<UserDetailDto> = {}): UserDetailDto {
    return {
        userId: 4,
        firstName: 'Max',
        lastName: 'Mustermann',
        email: 'max@acme.com',
        role: { roleId: 3, type: 'user', name: 'User' },
        createdAt: created,
        updatedAt: created,
        permissions: ['bounces.read'],
        memberships: [{ projectId: 1, projectName: 'Acme Website', permissions: ['update', 'read'] }],
        ...overrides,
    }
}
