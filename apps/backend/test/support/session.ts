import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { UserService } from '../../src/modules/user/services/user.service.js'
import { RoleService } from '../../src/modules/permission/services/role.service.js'
import type { RoleType } from '../../src/modules/permission/permission.constants.js'

export interface Credentials {
    email: string
    password: string
}

// Persists a user with known credentials so a test can authenticate as them.
// Files sharing the database must use distinct emails to avoid collisions.
export async function seedUser(
    app: INestApplication,
    credentials: Credentials,
    roleType: RoleType = 'super_admin',
): Promise<void> {
    const role = await app.get(RoleService).getRoleByType(roleType)
    await app.get(UserService).createUser({
        firstName: 'Test',
        lastName: 'User',
        email: credentials.email,
        password: credentials.password,
        roleId: role.roleId,
    })
}

// Logs in through the real endpoint and returns the bearer token.
export async function login(app: INestApplication<App>, credentials: Credentials): Promise<string> {
    const response = await request(app.getHttpServer()).post('/api/auth/login').send(credentials).expect(200)
    return (response.body as { token: string }).token
}

export async function globalRoleId(app: INestApplication, type: RoleType): Promise<number> {
    return (await app.get(RoleService).getRoleByType(type)).roleId
}

export async function projectRoleId(app: INestApplication, name: string): Promise<number> {
    const role = (await app.get(RoleService).getProjectRoles()).find((candidate) => candidate.name === name)
    if (!role) {
        throw new Error(`No project role named "${name}"`)
    }
    return role.roleId
}
