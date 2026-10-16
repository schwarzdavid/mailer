import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { globalRoleId, login, projectRoleId, seedUser, type Credentials } from './support/session.js'
import { configureSendingDomain } from './support/sending-domain.js'

describe('Permissions (e2e)', () => {
    let app: INestApplication<App>
    let superToken: string
    let memberToken: string
    let adminToken: string
    let superUserId: number
    let memberUserId: number
    let otherUserId: number
    let projectId: number
    let hiddenProjectId: number
    let visibleFormId: number
    let hiddenFormId: number
    let domainId: number
    let adminRoleId: number
    let superAdminRoleId: number
    let userRoleId: number
    let viewerRoleId: number
    let maintainerRoleId: number

    const superCredentials: Credentials = {
        email: 'perm.super@example.com',
        password: 'correct-horse-battery-staple',
    }
    const memberCredentials: Credentials = {
        email: 'perm.member@example.com',
        password: 'correct-horse-battery-staple',
    }
    const adminCredentials: Credentials = {
        email: 'perm.admin@example.com',
        password: 'correct-horse-battery-staple',
    }

    const http = () => request(app.getHttpServer())
    const asSuper = () => `Bearer ${superToken}`
    const asMember = () => `Bearer ${memberToken}`
    const asAdmin = () => `Bearer ${adminToken}`

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, superCredentials)
        superToken = await login(app, superCredentials)
        await configureSendingDomain(app, superToken, 'mail.perm-example.org')

        const me = await http().get('/api/auth/user').set('Authorization', asSuper()).expect(200)
        superUserId = (me.body as { userId: number }).userId
        userRoleId = await globalRoleId(app, 'user')
        viewerRoleId = await projectRoleId(app, 'Viewer')
        maintainerRoleId = await projectRoleId(app, 'Maintainer')
    })

    afterAll(async () => {
        await app?.close()
    })

    it('exposes the seeded roles', async () => {
        const response = await http().get('/api/role').set('Authorization', asSuper()).expect(200)
        const roles = response.body as {
            roleId: number
            name: string
            type: string
            scope: string
            permissions: string[]
        }[]

        expect(roles.filter((role) => role.scope === 'global')).toHaveLength(3)
        expect(
            roles
                .filter((role) => role.scope === 'project')
                .map((role) => role.name)
                .sort(),
        ).toEqual(['Editor', 'Maintainer', 'Owner', 'Viewer'])
        superAdminRoleId = roles.find((role) => role.type === 'super_admin')!.roleId
        adminRoleId = roles.find((role) => role.type === 'admin')!.roleId
        const adminRole = roles.find((role) => role.type === 'admin')!
        expect(adminRole.permissions).toContain('projects.all')
        expect(adminRole.permissions).toContain('roles.update')
        expect(roles.find((role) => role.type === 'user')!.permissions).toEqual([])
    })

    it('creates a member user with the default role', async () => {
        const response = await http()
            .post('/api/user')
            .set('Authorization', asSuper())
            .send({
                firstName: 'Member',
                lastName: 'User',
                email: memberCredentials.email,
                password: memberCredentials.password,
                roleId: userRoleId,
            })
            .expect(201)

        const body = response.body as { userId: number; role: { type: string } }
        memberUserId = body.userId
        expect(body.role.type).toBe('user')

        memberToken = await login(app, memberCredentials)
    })

    it('denies the member everything by default', async () => {
        await http().get('/api/domain').set('Authorization', asMember()).expect(403)
        await http().get('/api/user').set('Authorization', asMember()).expect(403)
        await http().get('/api/settings').set('Authorization', asMember()).expect(403)
        await http().get('/api/bounce').set('Authorization', asMember()).expect(403)

        const projects = await http().get('/api/project').set('Authorization', asMember()).expect(200)
        expect(projects.body).toEqual([])
    })

    it('hides unshared projects from the member', async () => {
        const created = await http()
            .post('/api/project')
            .set('Authorization', asSuper())
            .send({ name: 'Perm Project' })
            .expect(201)
        projectId = (created.body as { projectId: number }).projectId

        const hidden = await http().get(`/api/project/${projectId}`).set('Authorization', asMember()).expect(404)
        expect(hidden.status).toBe(404)
    })

    it('grants read access through a membership', async () => {
        await http()
            .put(`/api/project/${projectId}/members/${memberUserId}`)
            .set('Authorization', asSuper())
            .send({ roleId: viewerRoleId })
            .expect(200)

        const list = await http().get('/api/project').set('Authorization', asMember()).expect(200)
        expect((list.body as { projectId: number }[]).map((entry) => entry.projectId)).toContain(projectId)

        await http().get(`/api/project/${projectId}`).set('Authorization', asMember()).expect(200)
        await http()
            .patch(`/api/project/${projectId}`)
            .set('Authorization', asMember())
            .send({ name: 'Renamed' })
            .expect(403)
    })

    it('reserves the implicit access summary for project editors', async () => {
        const response = await http().get(`/api/project/${projectId}/implicit-access`).set('Authorization', asMember())

        expect(response.status).toBe(403)
    })

    it('lists inbound forms across projects only where the caller can read', async () => {
        const hidden = await http()
            .post('/api/project')
            .set('Authorization', asSuper())
            .send({ name: 'Perm Hidden Project' })
            .expect(201)
        hiddenProjectId = (hidden.body as { projectId: number }).projectId

        const visibleForm = await http()
            .post('/api/inbound-form')
            .set('Authorization', asSuper())
            .send({ name: 'Perm Visible', slug: 'perm-visible-form', domainId: null, projectId })
            .expect(201)
        visibleFormId = (visibleForm.body as { inboundFormId: number }).inboundFormId
        const hiddenForm = await http()
            .post('/api/inbound-form')
            .set('Authorization', asSuper())
            .send({ name: 'Perm Hidden', slug: 'perm-hidden-form', domainId: null, projectId: hiddenProjectId })
            .expect(201)
        hiddenFormId = (hiddenForm.body as { inboundFormId: number }).inboundFormId

        const memberForms = await http().get('/api/inbound-form').set('Authorization', asMember()).expect(200)
        const memberBody = memberForms.body as { inboundFormId: number; projectId: number; receivers: unknown[] }[]
        expect(memberBody.map((form) => form.inboundFormId)).toEqual([visibleFormId])
        expect(memberBody[0]).toMatchObject({ projectId, receivers: [] })

        const superForms = await http().get('/api/inbound-form').set('Authorization', asSuper()).expect(200)
        expect((superForms.body as { inboundFormId: number }[]).map((form) => form.inboundFormId)).toEqual(
            expect.arrayContaining([visibleFormId, hiddenFormId]),
        )

        await http()
            .get('/api/inbound-form')
            .query({ projectId: hiddenProjectId })
            .set('Authorization', asMember())
            .expect(404)
    })

    it('coerces the projectId query param for inbound forms', async () => {
        const memberForms = await http()
            .get('/api/inbound-form')
            .query({ projectId })
            .set('Authorization', asMember())
            .expect(200)
        expect((memberForms.body as { inboundFormId: number }[]).map((form) => form.inboundFormId)).toEqual([
            visibleFormId,
        ])
    })

    it('applies membership upgrades immediately', async () => {
        await http()
            .put(`/api/project/${projectId}/members/${memberUserId}`)
            .set('Authorization', asSuper())
            .send({ roleId: maintainerRoleId })
            .expect(200)

        const renamed = await http()
            .patch(`/api/project/${projectId}`)
            .set('Authorization', asMember())
            .send({ name: 'Perm Project Renamed' })
            .expect(200)
        expect(renamed.status).toBe(200)

        const access = await http()
            .get(`/api/project/${projectId}/implicit-access`)
            .set('Authorization', asMember())
            .expect(200)
        expect(access.body).toEqual({
            superAdminCount: expect.any(Number) as number,
            allProjectsUserCount: expect.any(Number) as number,
        })
        await http().get(`/api/project/${hiddenProjectId}/implicit-access`).set('Authorization', asMember()).expect(404)
    })

    it('requires the domains.read grant for domain assignment', async () => {
        const domainResponse = await http()
            .post('/api/domain')
            .set('Authorization', asSuper())
            .send({ fqdn: 'forms.member-example.com' })
            .expect(201)
        domainId = (domainResponse.body as { domainId: number }).domainId

        await http()
            .post(`/api/project/${projectId}/domains`)
            .set('Authorization', asMember())
            .send({ domainId })
            .expect(403)

        await http()
            .put(`/api/user/${memberUserId}/permissions`)
            .set('Authorization', asSuper())
            .send({ permissions: ['domains.read'] })
            .expect(200)

        const allowed = await http()
            .post(`/api/project/${projectId}/domains`)
            .set('Authorization', asMember())
            .send({ domainId })
            .expect(201)
        expect(allowed.status).toBe(201)
    })

    it('only names the projects of a domain the caller can read', async () => {
        await http()
            .post(`/api/project/${hiddenProjectId}/domains`)
            .set('Authorization', asSuper())
            .send({ domainId })
            .expect(201)

        const asMemberDetail = await http().get(`/api/domain/${domainId}`).set('Authorization', asMember()).expect(200)
        expect((asMemberDetail.body as { projects: unknown[] }).projects).toEqual([
            { projectId, name: 'Perm Project Renamed' },
        ])

        const asSuperDetail = await http().get(`/api/domain/${domainId}`).set('Authorization', asSuper()).expect(200)
        expect((asSuperDetail.body as { projects: { projectId: number }[] }).projects).toEqual(
            expect.arrayContaining([
                { projectId, name: 'Perm Project Renamed' },
                { projectId: hiddenProjectId, name: 'Perm Hidden Project' },
            ]),
        )
    })

    it('lets member managers add members', async () => {
        const otherResponse = await http()
            .post('/api/user')
            .set('Authorization', asSuper())
            .send({
                firstName: 'Other',
                lastName: 'User',
                email: 'perm.other@example.com',
                password: 'correct-horse-battery-staple',
                roleId: userRoleId,
            })
            .expect(201)
        otherUserId = (otherResponse.body as { userId: number }).userId

        await http()
            .put(`/api/project/${projectId}/members/${otherUserId}`)
            .set('Authorization', asMember())
            .send({ roleId: viewerRoleId })
            .expect(200)

        const members = await http()
            .get(`/api/project/${projectId}/members`)
            .set('Authorization', asMember())
            .expect(200)
        expect((members.body as { userId: number }[]).map((entry) => entry.userId)).toContain(otherUserId)
    })

    it('caps member managers at the project permissions they hold', async () => {
        const ownerRoleId = await projectRoleId(app, 'Owner')

        await http()
            .put(`/api/project/${projectId}/members/${otherUserId}`)
            .set('Authorization', asMember())
            .send({ roleId: ownerRoleId })
            .expect(403)
        await http()
            .put(`/api/project/${projectId}/members/${otherUserId}`)
            .set('Authorization', asMember())
            .send({ roleId: viewerRoleId, permissions: ['delete'] })
            .expect(403)

        const members = await http()
            .get(`/api/project/${projectId}/members`)
            .set('Authorization', asMember())
            .expect(200)
        const other = (members.body as { userId: number; role: { name: string }; permissions: string[] }[]).find(
            (entry) => entry.userId === otherUserId,
        )!
        expect(other.role.name).toBe('Viewer')
        expect(other.permissions).toEqual([])
    })

    it('lets member managers re-save a member whose current role they do not fully hold', async () => {
        const ownerRoleId = await projectRoleId(app, 'Owner')
        await http()
            .put(`/api/project/${projectId}/members/${otherUserId}`)
            .set('Authorization', asSuper())
            .send({ roleId: ownerRoleId })
            .expect(200)

        await http()
            .put(`/api/project/${projectId}/members/${otherUserId}`)
            .set('Authorization', asMember())
            .send({ roleId: ownerRoleId, permissions: [] })
            .expect(200)

        const members = await http()
            .get(`/api/project/${projectId}/members`)
            .set('Authorization', asMember())
            .expect(200)
        const other = (members.body as { userId: number; role: { name: string } }[]).find(
            (entry) => entry.userId === otherUserId,
        )!
        expect(other.role.name).toBe('Owner')

        await http()
            .put(`/api/project/${projectId}/members/${otherUserId}`)
            .set('Authorization', asSuper())
            .send({ roleId: viewerRoleId })
            .expect(200)
    })

    it('only lets users.update holders grant or revoke permissions they hold themselves', async () => {
        const managerCredentials: Credentials = {
            email: 'perm.manager@example.com',
            password: 'correct-horse-battery-staple',
        }
        const created = await http()
            .post('/api/user')
            .set('Authorization', asSuper())
            .send({ firstName: 'Manager', lastName: 'User', ...managerCredentials, roleId: userRoleId })
            .expect(201)
        const managerUserId = (created.body as { userId: number }).userId
        await http()
            .put(`/api/user/${managerUserId}/permissions`)
            .set('Authorization', asSuper())
            .send({ permissions: ['users.read', 'users.update'] })
            .expect(200)
        const asManager = `Bearer ${await login(app, managerCredentials)}`

        await http()
            .put(`/api/user/${managerUserId}/permissions`)
            .set('Authorization', asManager)
            .send({ permissions: ['users.read', 'users.update', 'settings.update', 'users.delete'] })
            .expect(403)
        await http()
            .put(`/api/user/${otherUserId}/permissions`)
            .set('Authorization', asManager)
            .send({ permissions: ['domains.delete'] })
            .expect(403)
        await http()
            .put(`/api/user/${memberUserId}/permissions`)
            .set('Authorization', asManager)
            .send({ permissions: [] })
            .expect(403)

        await http().get('/api/settings').set('Authorization', asManager).expect(403)
        const manager = await http().get(`/api/user/${managerUserId}`).set('Authorization', asManager).expect(200)
        expect((manager.body as { permissions: string[] }).permissions.sort()).toEqual(['users.read', 'users.update'])

        const granted = await http()
            .put(`/api/user/${otherUserId}/permissions`)
            .set('Authorization', asManager)
            .send({ permissions: ['users.read'] })
            .expect(200)
        expect(granted.body).toEqual({ permissions: ['users.read'] })
    })

    it('shields super admins from admins', async () => {
        await http()
            .post('/api/user')
            .set('Authorization', asSuper())
            .send({
                firstName: 'Admin',
                lastName: 'User',
                email: adminCredentials.email,
                password: adminCredentials.password,
                roleId: adminRoleId,
            })
            .expect(201)
        adminToken = await login(app, adminCredentials)

        await http().get('/api/user').set('Authorization', asAdmin()).expect(200)

        await http()
            .patch(`/api/user/${superUserId}`)
            .set('Authorization', asAdmin())
            .send({ firstName: 'Hacked' })
            .expect(403)

        await http().delete(`/api/user/${superUserId}`).set('Authorization', asAdmin()).expect(403)

        const sneaky = await http()
            .post('/api/user')
            .set('Authorization', asAdmin())
            .send({
                firstName: 'Sneaky',
                lastName: 'Admin',
                email: 'perm.sneaky@example.com',
                password: 'correct-horse-battery-staple',
                roleId: superAdminRoleId,
            })
            .expect(403)
        expect(sneaky.status).toBe(403)
    })

    it('protects the last super admin', async () => {
        const allUsers = await http().get('/api/user').set('Authorization', asSuper()).expect(200)
        const otherSuperAdmins = (allUsers.body as { userId: number; role: { type: string } }[]).filter(
            (user) => user.role.type === 'super_admin' && user.userId !== superUserId,
        )
        for (const otherSuperAdmin of otherSuperAdmins) {
            await http()
                .patch(`/api/user/${otherSuperAdmin.userId}`)
                .set('Authorization', asSuper())
                .send({ roleId: adminRoleId })
                .expect(200)
        }

        await http()
            .patch(`/api/user/${superUserId}`)
            .set('Authorization', asSuper())
            .send({ roleId: adminRoleId })
            .expect(400)

        const deleted = await http().delete(`/api/user/${superUserId}`).set('Authorization', asSuper()).expect(400)
        expect(deleted.status).toBe(400)
    })

    it('serves the caller ability rules', async () => {
        const response = await http().get('/api/auth/ability').set('Authorization', asMember()).expect(200)
        const rules = response.body as { action: string[]; subject: string }[]

        expect(rules.some((rule) => rule.subject === 'Project')).toBe(true)
        expect(rules.some((rule) => rule.subject === 'Domain' && rule.action.includes('read'))).toBe(true)
        expect(rules.some((rule) => rule.subject === 'Project' && rule.action.includes('members.manage'))).toBe(true)
    })
})
