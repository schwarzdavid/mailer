import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { globalRoleId, login, projectRoleId, seedUser, type Credentials } from './support/session.js'

interface RoleBody {
    roleId: number
    name: string
    scope: string
    type: string
    description: string | null
    permissions: string[]
    assignmentCount: number
}

describe('Roles (e2e)', () => {
    let app: INestApplication<App>
    let superToken: string
    let managerToken: string
    let managerUserId: number
    let customRoleId: number
    let projectAuditorRoleId: number
    let viewerRoleId: number

    const password = 'correct-horse-battery-staple'
    const superCredentials: Credentials = { email: 'role-e2e.super@example.com', password }
    const managerCredentials: Credentials = { email: 'role-e2e.manager@example.com', password }

    const http = () => request(app.getHttpServer())
    const bearer = (token: string) => `Bearer ${token}`

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, superCredentials)
        await seedUser(app, managerCredentials, 'user')
        superToken = await login(app, superCredentials)
        viewerRoleId = await projectRoleId(app, 'Viewer')

        const users = await http().get('/api/user').set('Authorization', bearer(superToken)).expect(200)
        managerUserId = (users.body as { userId: number; email: string }[]).find(
            (user) => user.email === managerCredentials.email,
        )!.userId
        await http()
            .put(`/api/user/${managerUserId}/permissions`)
            .set('Authorization', bearer(superToken))
            .send({ permissions: ['roles.read', 'roles.create', 'roles.update', 'roles.delete', 'users.read'] })
            .expect(200)
        managerToken = await login(app, managerCredentials)
    })

    afterAll(async () => {
        await app?.close()
    })

    it('lists roles of both scopes with assignment counts', async () => {
        const response = await http().get('/api/role').set('Authorization', bearer(managerToken)).expect(200)
        const roles = response.body as RoleBody[]

        expect(roles.find((role) => role.type === 'user')!.assignmentCount).toBeGreaterThanOrEqual(1)
        expect(roles.find((role) => role.name === 'Viewer')).toMatchObject({ scope: 'project', permissions: ['read'] })
    })

    it('creates a global role limited to the permissions the caller holds', async () => {
        await http()
            .post('/api/role')
            .set('Authorization', bearer(managerToken))
            .send({ name: 'Auditor', scope: 'global', permissions: ['users.read', 'users.delete'] })
            .expect(403)

        const created = await http()
            .post('/api/role')
            .set('Authorization', bearer(managerToken))
            .send({ name: 'Auditor', scope: 'global', description: 'Reads users', permissions: ['users.read'] })
            .expect(201)
        customRoleId = (created.body as RoleBody).roleId
        expect(created.body).toMatchObject({ name: 'Auditor', scope: 'global', type: 'custom', assignmentCount: 0 })

        await http()
            .post('/api/role')
            .set('Authorization', bearer(superToken))
            .send({ name: 'Auditor', scope: 'global', permissions: [] })
            .expect(400)
        const projectAuditor = await http()
            .post('/api/role')
            .set('Authorization', bearer(superToken))
            .send({ name: 'Auditor', scope: 'project', permissions: ['read'] })
            .expect(201)
        projectAuditorRoleId = (projectAuditor.body as RoleBody).roleId
    })

    it('requires read on project roles and rejects foreign permissions', async () => {
        await http()
            .post('/api/role')
            .set('Authorization', bearer(superToken))
            .send({ name: 'Broken', scope: 'project', permissions: ['delete'] })
            .expect(400)
        const foreign = await http()
            .post('/api/role')
            .set('Authorization', bearer(superToken))
            .send({ name: 'Broken', scope: 'project', permissions: ['read', 'users.read'] })
        expect(foreign.status).toBe(400)
    })

    it('keeps project role edits behind unconditional project permissions', async () => {
        await http()
            .patch(`/api/role/${viewerRoleId}`)
            .set('Authorization', bearer(managerToken))
            .send({ permissions: ['read', 'delete'] })
            .expect(403)
        const described = await http()
            .patch(`/api/role/${viewerRoleId}`)
            .set('Authorization', bearer(managerToken))
            .send({ description: 'Looks around' })
            .expect(200)
        expect(described.body).toMatchObject({ description: 'Looks around', permissions: ['read'] })
    })

    it('applies role permission changes to existing sessions', async () => {
        await http()
            .patch(`/api/user/${managerUserId}`)
            .set('Authorization', bearer(superToken))
            .send({ roleId: customRoleId })
            .expect(200)
        await http().get('/api/domain').set('Authorization', bearer(managerToken)).expect(403)

        await http()
            .patch(`/api/role/${customRoleId}`)
            .set('Authorization', bearer(superToken))
            .send({ permissions: ['users.read', 'domains.read'] })
            .expect(200)

        const domains = await http().get('/api/domain').set('Authorization', bearer(managerToken))
        expect(domains.status).toBe(200)
    })

    it('refuses to delete an assigned role and the super admin role', async () => {
        const assigned = await http().delete(`/api/role/${customRoleId}`).set('Authorization', bearer(superToken))
        expect(assigned.status).toBe(400)
        expect((assigned.body as { message: string }).message).toContain('1 users')

        const superAdminRoleId = await globalRoleId(app, 'super_admin')
        await http().delete(`/api/role/${superAdminRoleId}`).set('Authorization', bearer(superToken)).expect(403)
        const renamed = await http()
            .patch(`/api/role/${superAdminRoleId}`)
            .set('Authorization', bearer(superToken))
            .send({ name: 'Root' })
        expect(renamed.status).toBe(403)
    })

    it('deletes an unassigned role and answers unknown roles with 404', async () => {
        const userRoleId = await globalRoleId(app, 'user')
        await http()
            .patch(`/api/user/${managerUserId}`)
            .set('Authorization', bearer(superToken))
            .send({ roleId: userRoleId })
            .expect(200)

        await http().delete(`/api/role/${customRoleId}`).set('Authorization', bearer(superToken)).expect(200)
        const missing = await http().get(`/api/role/${customRoleId}`).set('Authorization', bearer(superToken))
        expect(missing.status).toBe(404)

        await http().delete(`/api/role/${projectAuditorRoleId}`).set('Authorization', bearer(superToken)).expect(200)
        await http()
            .patch(`/api/role/${viewerRoleId}`)
            .set('Authorization', bearer(superToken))
            .send({ description: 'Sees the project, its forms and sent mail.' })
            .expect(200)
    })

    it('reports what the caller holds', async () => {
        const response = await http().get('/api/auth/permissions').set('Authorization', bearer(superToken)).expect(200)
        expect(response.body).toMatchObject({
            projectPermissions: ['read', 'update', 'delete', 'forms.manage', 'api_keys.manage', 'members.manage'],
        })
        expect((response.body as { permissions: string[] }).permissions).toContain('roles.create')
    })
})
