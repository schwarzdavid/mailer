import type { RoleDto, UserDetailDto, UserDto } from 'api'

const created = new Date('2026-01-01T00:00:00.000Z')

export const roles: RoleDto[] = [
    {
        roleId: 1,
        type: 'super_admin',
        scope: 'global',
        name: 'Super Admin',
        description: 'Every permission, including changing other Super admins',
        permissions: [],
        assignmentCount: 1,
    },
    {
        roleId: 2,
        type: 'admin',
        scope: 'global',
        name: 'Admin',
        description: "Every permission, but can't change Super admins",
        permissions: ['domains.read', 'projects.all'],
        assignmentCount: 1,
    },
    {
        roleId: 3,
        type: 'user',
        scope: 'global',
        name: 'User',
        description: 'No permissions of its own; add them per user or through project memberships',
        permissions: [],
        assignmentCount: 2,
    },
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
        memberships: [
            {
                projectId: 1,
                projectName: 'Acme Website',
                role: { roleId: 7, name: 'Maintainer' },
                permissions: ['delete'],
            },
        ],
        ...overrides,
    }
}
