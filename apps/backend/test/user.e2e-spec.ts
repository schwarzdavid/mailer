import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { login, seedUser, type Credentials } from './support/session.js'
import type { RoleType } from '../src/modules/permission/permission.constants.js'

interface UserBody {
    userId: number
    firstName: string
    lastName: string
    email: string
    role: { roleId: number; name: string; type: RoleType }
    password?: string
    roleId?: number
}

interface UserListBody extends UserBody {
    membershipCount: number
}

interface UserDetailBody extends UserBody {
    permissions: string[]
    memberships: { projectId: number; projectName: string; permissions: string[] }[]
}

interface RoleBody {
    roleId: number
    name: string
    type: RoleType
    permissions: string[]
}

describe('User + Role (e2e)', () => {
    let app: INestApplication<App>
    let superToken: string
    let adminToken: string
    let memberToken: string
    let superUserId: number
    let managedUserId: number
    let adminRoleId: number
    let userRoleId: number

    const password = 'correct-horse-battery-staple'
    const superCredentials: Credentials = { email: 'user-e2e.super@example.com', password }
    const adminCredentials: Credentials = { email: 'user-e2e.admin@example.com', password }
    const memberCredentials: Credentials = { email: 'user-e2e.member@example.com', password }
    const managedCredentials: Credentials = { email: 'user-e2e.managed@example.com', password }

    const http = () => request(app.getHttpServer())
    const bearer = (token: string) => `Bearer ${token}`

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, superCredentials)
        await seedUser(app, adminCredentials, 'admin')
        await seedUser(app, memberCredentials, 'user')
        superToken = await login(app, superCredentials)
        adminToken = await login(app, adminCredentials)
        memberToken = await login(app, memberCredentials)

        const me = await http().get('/api/auth/user').set('Authorization', bearer(superToken)).expect(200)
        superUserId = (me.body as UserBody).userId
    })

    afterAll(async () => {
        await app?.close()
    })

    describe('authentication', () => {
        it.each([
            ['get', '/api/user'],
            ['post', '/api/user'],
            ['get', '/api/user/1'],
            ['patch', '/api/user/1'],
            ['delete', '/api/user/1'],
            ['put', '/api/user/1/permissions'],
            ['get', '/api/role'],
        ] as const)('rejects %s %s without a token', async (method, path) => {
            const response = await http()[method](path)

            expect(response.status).toBe(401)
        })
    })

    describe('authorization', () => {
        it.each([
            ['get', '/api/user'],
            ['post', '/api/user'],
            ['get', '/api/user/1'],
            ['patch', '/api/user/1'],
            ['delete', '/api/user/1'],
            ['put', '/api/user/1/permissions'],
            ['get', '/api/role'],
        ] as const)('denies %s %s to a plain user', async (method, path) => {
            const response = await http()[method](path).set('Authorization', bearer(memberToken)).send({})

            expect(response.status).toBe(403)
        })
    })

    describe('GET /role', () => {
        it('lists every role with its permissions for an admin', async () => {
            const response = await http().get('/api/role').set('Authorization', bearer(adminToken)).expect(200)
            const roles = response.body as RoleBody[]

            expect(roles.map((role) => role.type).sort()).toEqual(['admin', 'super_admin', 'user'])
            const admin = roles.find((role) => role.type === 'admin')!
            expect(admin.permissions).toEqual(expect.arrayContaining(['users.read', 'roles.read', 'bounces.read']))
            adminRoleId = admin.roleId
            userRoleId = roles.find((role) => role.type === 'user')!.roleId
        })
    })

    describe('POST /user', () => {
        it('creates a user without leaking the password hash', async () => {
            const response = await http()
                .post('/api/user')
                .set('Authorization', bearer(adminToken))
                .send({ firstName: 'Managed', lastName: 'Person', ...managedCredentials })
                .expect(201)
            const body = response.body as UserBody

            managedUserId = body.userId
            expect(body).toMatchObject({
                firstName: 'Managed',
                lastName: 'Person',
                email: managedCredentials.email,
                role: { roleId: userRoleId, type: 'user' },
            })
            expect(body.password).toBeUndefined()
            expect(body.roleId).toBeUndefined()

            await login(app, managedCredentials)
        })

        it('rejects a duplicate email with 400', async () => {
            const response = await http()
                .post('/api/user')
                .set('Authorization', bearer(superToken))
                .send({ firstName: 'Dup', lastName: 'Licate', ...managedCredentials })

            expect(response.status).toBe(400)
        })

        it('rejects an unknown role with 400', async () => {
            const response = await http().post('/api/user').set('Authorization', bearer(superToken)).send({
                firstName: 'No',
                lastName: 'Role',
                email: 'user-e2e.norole@example.com',
                password,
                roleId: 999_999,
            })

            expect(response.status).toBe(400)
        })

        it.each([
            ['missing names', { email: 'user-e2e.invalid@example.com', password }],
            ['an invalid email', { firstName: 'A', lastName: 'B', email: 'not-an-email', password }],
            [
                'a short password',
                { firstName: 'A', lastName: 'B', email: 'user-e2e.short@example.com', password: 'short' },
            ],
            [
                'a non-integer role',
                { firstName: 'A', lastName: 'B', email: 'user-e2e.role@example.com', password, roleId: 'admin' },
            ],
        ])('rejects %s with 400', async (_case, body) => {
            const response = await http().post('/api/user').set('Authorization', bearer(superToken)).send(body)

            expect(response.status).toBe(400)
        })
    })

    describe('GET /user', () => {
        it('lists users without password hashes', async () => {
            const response = await http().get('/api/user').set('Authorization', bearer(adminToken)).expect(200)
            const users = response.body as UserBody[]

            expect(users.map((user) => user.email)).toEqual(
                expect.arrayContaining([superCredentials.email, managedCredentials.email]),
            )
            expect(users.every((user) => user.password === undefined)).toBe(true)
        })

        it('counts the distinct non-deleted project memberships of each listed user', async () => {
            const membershipCount = async (userId: number): Promise<number | undefined> => {
                const response = await http().get('/api/user').set('Authorization', bearer(superToken)).expect(200)
                return (response.body as UserListBody[]).find((user) => user.userId === userId)?.membershipCount
            }
            const createProject = async (name: string): Promise<number> => {
                const response = await http()
                    .post('/api/project')
                    .set('Authorization', bearer(superToken))
                    .send({ name })
                    .expect(201)
                return (response.body as { projectId: number }).projectId
            }

            expect(await membershipCount(managedUserId)).toBe(0)

            const firstProjectId = await createProject('User E2E Membership One')
            const secondProjectId = await createProject('User E2E Membership Two')
            await http()
                .put(`/api/project/${firstProjectId}/members/${managedUserId}`)
                .set('Authorization', bearer(superToken))
                .send({ permissions: ['read', 'update', 'delete'] })
                .expect(200)
            await http()
                .put(`/api/project/${secondProjectId}/members/${managedUserId}`)
                .set('Authorization', bearer(superToken))
                .send({ permissions: ['read'] })
                .expect(200)
            expect(await membershipCount(managedUserId)).toBe(2)

            await http().delete(`/api/project/${secondProjectId}`).set('Authorization', bearer(superToken)).expect(200)
            expect(await membershipCount(managedUserId)).toBe(1)

            await http()
                .post(`/api/project/${secondProjectId}/restore`)
                .set('Authorization', bearer(superToken))
                .expect(201)
            expect(await membershipCount(managedUserId)).toBe(2)

            for (const projectId of [firstProjectId, secondProjectId]) {
                await http()
                    .delete(`/api/project/${projectId}/members/${managedUserId}`)
                    .set('Authorization', bearer(superToken))
                    .expect(200)
            }
            expect(await membershipCount(managedUserId)).toBe(0)
        })

        it('returns the user detail with permissions and memberships', async () => {
            const response = await http()
                .get(`/api/user/${managedUserId}`)
                .set('Authorization', bearer(adminToken))
                .expect(200)
            const body = response.body as UserDetailBody

            expect(body).toMatchObject({ userId: managedUserId, permissions: [], memberships: [] })
            expect(body.password).toBeUndefined()
        })

        it('answers an unknown user with 404', async () => {
            const response = await http().get('/api/user/999999').set('Authorization', bearer(adminToken))

            expect(response.status).toBe(404)
        })
    })

    describe('PUT /user/:userId/permissions', () => {
        it('grants global permissions that take effect on the next request', async () => {
            const managedToken = await login(app, managedCredentials)
            await http().get('/api/domain').set('Authorization', bearer(managedToken)).expect(403)

            const response = await http()
                .put(`/api/user/${managedUserId}/permissions`)
                .set('Authorization', bearer(adminToken))
                .send({ permissions: ['domains.read', 'domains.read', 'bounces.read'] })
                .expect(200)
            expect(response.body).toEqual({ permissions: ['domains.read', 'bounces.read'] })

            await http().get('/api/domain').set('Authorization', bearer(managedToken)).expect(200)
            await http().get('/api/bounce').set('Authorization', bearer(managedToken)).expect(200)

            const detail = await http()
                .get(`/api/user/${managedUserId}`)
                .set('Authorization', bearer(adminToken))
                .expect(200)
            expect((detail.body as UserDetailBody).permissions.sort()).toEqual(['bounces.read', 'domains.read'])
        })

        it('revokes permissions that were replaced', async () => {
            const managedToken = await login(app, managedCredentials)
            await http().get('/api/domain').set('Authorization', bearer(managedToken)).expect(200)

            await http()
                .put(`/api/user/${managedUserId}/permissions`)
                .set('Authorization', bearer(adminToken))
                .send({ permissions: [] })
                .expect(200)

            const revoked = await http().get('/api/domain').set('Authorization', bearer(managedToken))
            expect(revoked.status).toBe(403)
        })

        it('rejects unknown permission names with 400', async () => {
            const response = await http()
                .put(`/api/user/${managedUserId}/permissions`)
                .set('Authorization', bearer(adminToken))
                .send({ permissions: ['everything.all'] })

            expect(response.status).toBe(400)
        })

        it('answers an unknown user with 404', async () => {
            const response = await http()
                .put('/api/user/999999/permissions')
                .set('Authorization', bearer(adminToken))
                .send({ permissions: [] })

            expect(response.status).toBe(404)
        })

        it('forbids admins from changing super admin permissions', async () => {
            const response = await http()
                .put(`/api/user/${superUserId}/permissions`)
                .set('Authorization', bearer(adminToken))
                .send({ permissions: [] })

            expect(response.status).toBe(403)
        })
    })

    describe('PATCH /user/:userId', () => {
        it('updates profile fields and rotates the password', async () => {
            const newPassword = 'another-long-password'
            const response = await http()
                .patch(`/api/user/${managedUserId}`)
                .set('Authorization', bearer(adminToken))
                .send({ firstName: 'Renamed', password: newPassword })
                .expect(200)

            expect(response.body).toMatchObject({ userId: managedUserId, firstName: 'Renamed', lastName: 'Person' })
            expect((response.body as UserBody).password).toBeUndefined()

            await http().post('/api/auth/login').send(managedCredentials).expect(401)
            await login(app, { email: managedCredentials.email, password: newPassword })

            await http()
                .patch(`/api/user/${managedUserId}`)
                .set('Authorization', bearer(adminToken))
                .send({ password })
                .expect(200)
        })

        it('applies a role change to existing tokens immediately', async () => {
            const managedToken = await login(app, managedCredentials)
            await http().get('/api/user').set('Authorization', bearer(managedToken)).expect(403)

            const response = await http()
                .patch(`/api/user/${managedUserId}`)
                .set('Authorization', bearer(superToken))
                .send({ roleId: adminRoleId })
                .expect(200)
            expect((response.body as UserBody).role.type).toBe('admin')

            await http().get('/api/user').set('Authorization', bearer(managedToken)).expect(200)

            await http()
                .patch(`/api/user/${managedUserId}`)
                .set('Authorization', bearer(superToken))
                .send({ roleId: userRoleId })
                .expect(200)

            await http().get('/api/user').set('Authorization', bearer(managedToken)).expect(403)
        })

        it('rejects an email that is already in use with 400', async () => {
            const response = await http()
                .patch(`/api/user/${managedUserId}`)
                .set('Authorization', bearer(adminToken))
                .send({ email: adminCredentials.email })

            expect(response.status).toBe(400)
        })

        it('rejects invalid fields with 400', async () => {
            const response = await http()
                .patch(`/api/user/${managedUserId}`)
                .set('Authorization', bearer(adminToken))
                .send({ email: 'broken', password: 'short' })

            expect(response.status).toBe(400)
        })

        it('answers an unknown user with 404', async () => {
            const response = await http()
                .patch('/api/user/999999')
                .set('Authorization', bearer(adminToken))
                .send({ firstName: 'Ghost' })

            expect(response.status).toBe(404)
        })
    })

    describe('DELETE /user/:userId', () => {
        it('refuses to let a user delete themselves', async () => {
            const me = await http().get('/api/auth/user').set('Authorization', bearer(adminToken)).expect(200)
            const adminUserId = (me.body as UserBody).userId

            const response = await http().delete(`/api/user/${adminUserId}`).set('Authorization', bearer(adminToken))

            expect(response.status).toBe(400)
        })

        it('deletes a user and invalidates their existing token', async () => {
            const managedToken = await login(app, managedCredentials)
            await http().get('/api/auth/user').set('Authorization', bearer(managedToken)).expect(200)

            await http().delete(`/api/user/${managedUserId}`).set('Authorization', bearer(adminToken)).expect(200)

            await http().get(`/api/user/${managedUserId}`).set('Authorization', bearer(adminToken)).expect(404)
            await http().post('/api/auth/login').send(managedCredentials).expect(401)
            const staleToken = await http().get('/api/auth/user').set('Authorization', bearer(managedToken))
            expect(staleToken.status).toBe(401)
        })

        it('answers an unknown user with 404', async () => {
            const response = await http().delete('/api/user/999999').set('Authorization', bearer(adminToken))

            expect(response.status).toBe(404)
        })
    })

    describe('request validation', () => {
        it.each([
            ['get', '/api/user/not-a-number'],
            ['patch', '/api/user/not-a-number'],
            ['delete', '/api/user/not-a-number'],
            ['put', '/api/user/not-a-number/permissions'],
        ] as const)('rejects %s %s with 400', async (method, path) => {
            const response = await http()[method](path).set('Authorization', bearer(superToken)).send({})

            expect(response.status).toBe(400)
        })

        it('rejects properties the endpoint does not accept', async () => {
            const response = await http()
                .patch(`/api/user/${superUserId}`)
                .set('Authorization', bearer(superToken))
                .send({ firstName: 'Mallory', userId: 1, passwordHash: 'x' })

            expect(response.status).toBe(400)
            const me = await http().get('/api/auth/user').set('Authorization', bearer(superToken)).expect(200)
            expect((me.body as { firstName: string }).firstName).not.toBe('Mallory')
        })

        it('rejects an empty name with 400', async () => {
            const response = await http()
                .patch(`/api/user/${superUserId}`)
                .set('Authorization', bearer(superToken))
                .send({ lastName: '' })

            expect(response.status).toBe(400)
        })
    })
})
