import { INestApplication } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './support/app.js'
import { login, projectRoleId, seedUser, type Credentials } from './support/session.js'
import { configureSendingDomain } from './support/sending-domain.js'
import { ProjectModel } from '../src/modules/project/models/project.model.js'
import { ProjectPurgeService } from '../src/modules/project/services/project-purge.service.js'
import { PROJECT_PURGE_AFTER_MS } from '../src/modules/project/project.constants.js'
import { DomainDnsModel } from '../src/modules/domain/models/domain-dns.model.js'
import { DomainDnsRecordStatus } from '../src/modules/domain/interfaces/domain-dns.interface.js'

interface ProjectListBody {
    projectId: number
    inboundFormCount: number
    domainCount: number
    memberCount: number
    domainsHealthy: boolean
}

interface InboundFormListBody {
    inboundFormId: number
    projectId: number
    receivers: {
        inboundFormReceiverId: number
        emailFrom: string
        emailReceiver: string
        emailReplyTo: string | null
        isActive: boolean
        draftVersion: number | null
        publishedVersion: number | null
    }[]
}

describe('Project (e2e)', () => {
    let app: INestApplication<App>
    let token: string
    let projectId: number
    let otherProjectId: number
    let domainId: number
    let inboundFormId: number
    const slug = 'e2e-project-contact'

    const credentials: Credentials = {
        email: 'project.user@example.com',
        password: 'correct-horse-battery-staple',
    }

    const http = () => request(app.getHttpServer())
    const auth = () => `Bearer ${token}`

    async function listProjects(bearer = auth()): Promise<Map<number, ProjectListBody>> {
        const response = await http().get('/api/project').set('Authorization', bearer).expect(200)
        return new Map((response.body as ProjectListBody[]).map((project) => [project.projectId, project]))
    }

    async function listForms(): Promise<InboundFormListBody[]> {
        const response = await http().get('/api/inbound-form').set('Authorization', auth()).expect(200)
        return response.body as InboundFormListBody[]
    }

    async function implicitAccess(): Promise<{ superAdminCount: number; allProjectsUserCount: number }> {
        const response = await http()
            .get(`/api/project/${otherProjectId}/implicit-access`)
            .set('Authorization', auth())
            .expect(200)
        return response.body as { superAdminCount: number; allProjectsUserCount: number }
    }

    beforeAll(async () => {
        app = await createTestApp()
        await seedUser(app, credentials)
        token = await login(app, credentials)
        await configureSendingDomain(app, token)
    })

    afterAll(async () => {
        await app?.close()
    })

    it('creates a project', async () => {
        const response = await http()
            .post('/api/project')
            .set('Authorization', auth())
            .send({ name: 'E2E Project' })
            .expect(201)

        projectId = (response.body as { projectId: number }).projectId
        expect((response.body as { name: string }).name).toBe('E2E Project')
    })

    it('rejects duplicate project names', async () => {
        const response = await http().post('/api/project').set('Authorization', auth()).send({ name: 'E2E Project' })

        expect(response.status).toBe(400)
    })

    it('assigns a domain to the project', async () => {
        const domainResponse = await http()
            .post('/api/domain')
            .set('Authorization', auth())
            .send({ fqdn: 'forms.project-example.com' })
            .expect(201)
        domainId = (domainResponse.body as { domainId: number }).domainId

        await http()
            .post(`/api/project/${projectId}/domains`)
            .set('Authorization', auth())
            .send({ domainId })
            .expect(201)

        const detail = await http().get(`/api/project/${projectId}`).set('Authorization', auth()).expect(200)
        expect((detail.body as { domains: { domainId: number }[] }).domains).toEqual([
            expect.objectContaining({ domainId }),
        ])
    })

    it('names the projects a domain is assigned to', async () => {
        const detail = await http().get(`/api/domain/${domainId}`).set('Authorization', auth()).expect(200)

        expect(detail.body).toMatchObject({ domainId, projects: [{ projectId, name: 'E2E Project' }] })
    })

    it('refuses to delete a domain while a project uses it', async () => {
        const response = await http().delete(`/api/domain/${domainId}`).set('Authorization', auth())

        expect(response.status).toBe(409)
        expect((response.body as { message: string }).message).toBe(
            'The domain is still assigned to 1 project(s). Remove it from every project before deleting it.',
        )
        await http().get(`/api/domain/${domainId}`).set('Authorization', auth()).expect(200)
    })

    it('creates forms only with domains of the same project', async () => {
        const otherResponse = await http()
            .post('/api/project')
            .set('Authorization', auth())
            .send({ name: 'E2E Other' })
            .expect(201)
        otherProjectId = (otherResponse.body as { projectId: number }).projectId

        const blockedResponse = await http()
            .post('/api/inbound-form')
            .set('Authorization', auth())
            .send({ name: 'Blocked', slug: 'e2e-project-blocked', domainId, projectId: otherProjectId })

        expect(blockedResponse.status).toBe(400)

        const formResponse = await http()
            .post('/api/inbound-form')
            .set('Authorization', auth())
            .send({ name: 'Project Contact', slug, domainId, projectId })
            .expect(201)
        inboundFormId = (formResponse.body as { inboundFormId: number }).inboundFormId
    })

    it('reports member counts and domain health in the project list', async () => {
        const projects = await listProjects()

        expect(projects.get(projectId)).toMatchObject({
            inboundFormCount: 1,
            domainCount: 1,
            memberCount: 0,
            domainsHealthy: false,
        })
        expect(projects.get(otherProjectId)).toMatchObject({
            inboundFormCount: 0,
            domainCount: 0,
            memberCount: 0,
            domainsHealthy: true,
        })

        const dnsModel = app.get<typeof DomainDnsModel>(getModelToken(DomainDnsModel))
        await dnsModel.update({ status: DomainDnsRecordStatus.VALID }, { where: { domainId } })
        expect((await listProjects()).get(projectId)?.domainsHealthy).toBe(true)

        await dnsModel.update({ status: DomainDnsRecordStatus.INVALID }, { where: { domainId } })
        expect((await listProjects()).get(projectId)?.domainsHealthy).toBe(false)
    })

    it('lists forms of every project with their receivers when no project is given', async () => {
        const receiverResponse = await http()
            .post(`/api/inbound-form/${inboundFormId}/receiver`)
            .set('Authorization', auth())
            .send({ emailFrom: 'noreply@forms.project-example.com', emailReceiver: 'owner@project-example.com' })
            .expect(201)
        const inboundFormReceiverId = (receiverResponse.body as { inboundFormReceiverId: number }).inboundFormReceiverId

        const listed = (await listForms()).find((form) => form.inboundFormId === inboundFormId)
        expect(listed).toMatchObject({
            projectId,
            receivers: [
                {
                    inboundFormReceiverId,
                    emailFrom: 'noreply@forms.project-example.com',
                    emailReceiver: 'owner@project-example.com',
                    emailReplyTo: null,
                    isActive: true,
                    draftVersion: null,
                    publishedVersion: null,
                },
            ],
        })

        await http()
            .put(`/api/inbound-form/${inboundFormId}/receiver/${inboundFormReceiverId}/template/draft`)
            .set('Authorization', auth())
            .send({ subject: 'New request', template: '<p>{{email}}</p>' })
            .expect(200)
        await http()
            .post(`/api/inbound-form/${inboundFormId}/receiver/${inboundFormReceiverId}/template/publish`)
            .set('Authorization', auth())
            .expect(201)

        const published = (await listForms()).find((form) => form.inboundFormId === inboundFormId)
        expect(published?.receivers[0]).toMatchObject({ draftVersion: null, publishedVersion: 1 })

        await http()
            .delete(`/api/inbound-form/${inboundFormId}/receiver/${inboundFormReceiverId}`)
            .set('Authorization', auth())
            .expect(200)
    })

    it('filters forms by project', async () => {
        const mine = await http().get('/api/inbound-form').query({ projectId }).set('Authorization', auth()).expect(200)
        expect((mine.body as { inboundFormId: number }[]).map((form) => form.inboundFormId)).toContain(inboundFormId)

        const other = await http()
            .get('/api/inbound-form')
            .query({ projectId: otherProjectId })
            .set('Authorization', auth())
            .expect(200)
        expect(other.body).toEqual([])
    })

    it('blocks unassigning a domain that forms still use', async () => {
        const response = await http()
            .delete(`/api/project/${projectId}/domains/${domainId}`)
            .set('Authorization', auth())

        expect(response.status).toBe(400)
    })

    it('soft deletes the project and hides its forms publicly', async () => {
        await http().post(`/api/public/form/${slug}`).send({ data: {} }).expect(201)

        await http().delete(`/api/project/${projectId}`).set('Authorization', auth()).expect(200)

        const list = await http().get('/api/project').set('Authorization', auth()).expect(200)
        expect((list.body as { projectId: number }[]).map((project) => project.projectId)).not.toContain(projectId)

        const deleted = await http().get('/api/project/deleted').set('Authorization', auth()).expect(200)
        expect(deleted.body).toEqual([
            expect.objectContaining({ projectId, name: 'E2E Project', purgeAt: expect.any(String) as string }),
        ])

        await http().post(`/api/public/form/${slug}`).send({ data: {} }).expect(404)

        expect((await listForms()).map((form) => form.inboundFormId)).not.toContain(inboundFormId)
        const scoped = await http()
            .get('/api/inbound-form')
            .query({ projectId })
            .set('Authorization', auth())
            .expect(200)
        expect(scoped.body).toEqual([])
    })

    it('omits deleted projects from a domain but keeps it undeletable while their forms use it', async () => {
        const detail = await http().get(`/api/domain/${domainId}`).set('Authorization', auth()).expect(200)
        expect((detail.body as { projects: unknown[] }).projects).toEqual([])

        const response = await http().delete(`/api/domain/${domainId}`).set('Authorization', auth())
        expect(response.status).toBe(409)
        expect((response.body as { message: string }).message).toBe('The domain is still used by inbound forms')
    })

    it('restores the project and re-enables its forms', async () => {
        const restoreResponse = await http().post(`/api/project/${projectId}/restore`).set('Authorization', auth())

        expect(restoreResponse.status).toBe(201)

        await http().post(`/api/public/form/${slug}`).send({ data: {} }).expect(201)
        expect((await listForms()).map((form) => form.inboundFormId)).toContain(inboundFormId)
    })

    it('purges projects past the retention window together with their forms', async () => {
        await http().delete(`/api/project/${projectId}`).set('Authorization', auth()).expect(200)

        const projectModel = app.get<typeof ProjectModel>(getModelToken(ProjectModel))
        await projectModel.update(
            { deletedAt: new Date(Date.now() - PROJECT_PURGE_AFTER_MS - 60_000) },
            { where: { projectId }, paranoid: false },
        )

        await app.get(ProjectPurgeService).purgeExpiredProjects()

        await http().get(`/api/inbound-form/${inboundFormId}`).set('Authorization', auth()).expect(404)

        const deleted = await http().get('/api/project/deleted').set('Authorization', auth()).expect(200)
        expect((deleted.body as { projectId: number }[]).map((project) => project.projectId)).not.toContain(projectId)

        await http().delete(`/api/domain/${domainId}`).set('Authorization', auth()).expect(200)
        await http().get(`/api/domain/${domainId}`).set('Authorization', auth()).expect(404)
    })

    it('deletes a domain only held by a deleted project and restores that project without it', async () => {
        const trashed = await http()
            .post('/api/project')
            .set('Authorization', auth())
            .send({ name: 'E2E Trashed Holder' })
            .expect(201)
        const trashedProjectId = (trashed.body as { projectId: number }).projectId
        const domainResponse = await http()
            .post('/api/domain')
            .set('Authorization', auth())
            .send({ fqdn: 'forms.trashed-holder-example.com' })
            .expect(201)
        const heldDomainId = (domainResponse.body as { domainId: number }).domainId
        await http()
            .post(`/api/project/${trashedProjectId}/domains`)
            .set('Authorization', auth())
            .send({ domainId: heldDomainId })
            .expect(201)

        await http().delete(`/api/domain/${heldDomainId}`).set('Authorization', auth()).expect(409)

        await http().delete(`/api/project/${trashedProjectId}`).set('Authorization', auth()).expect(200)
        await http().delete(`/api/domain/${heldDomainId}`).set('Authorization', auth()).expect(200)

        await http().post(`/api/project/${trashedProjectId}/restore`).set('Authorization', auth()).expect(201)
        const restored = await http().get(`/api/project/${trashedProjectId}`).set('Authorization', auth()).expect(200)
        expect((restored.body as { domains: unknown[] }).domains).toEqual([])
    })

    it('adds, lists and removes project members', async () => {
        const memberCredentials: Credentials = {
            email: 'project.member@example.com',
            password: 'correct-horse-battery-staple',
        }
        await seedUser(app, memberCredentials, 'user')
        const memberToken = await login(app, memberCredentials)
        const users = await http().get('/api/user').set('Authorization', auth()).expect(200)
        const memberUserId = (users.body as { userId: number; email: string }[]).find(
            (user) => user.email === memberCredentials.email,
        )!.userId

        await http()
            .put(`/api/project/${otherProjectId}/members/${memberUserId}`)
            .set('Authorization', auth())
            .send({ roleId: 999_999 })
            .expect(400)
        await http()
            .put(`/api/project/${otherProjectId}/members/${memberUserId}`)
            .set('Authorization', auth())
            .send({ roleId: await projectRoleId(app, 'Maintainer') })
            .expect(200)
        expect((await listProjects()).get(otherProjectId)?.memberCount).toBe(1)

        const members = await http()
            .get(`/api/project/${otherProjectId}/members`)
            .set('Authorization', auth())
            .expect(200)
        expect(members.body).toEqual([
            expect.objectContaining({
                userId: memberUserId,
                email: memberCredentials.email,
                role: expect.objectContaining({ name: 'Maintainer' }) as object,
                permissions: [],
            }),
        ])
        await http().get(`/api/project/${otherProjectId}`).set('Authorization', `Bearer ${memberToken}`).expect(200)

        await http()
            .delete(`/api/project/${otherProjectId}/members/${memberUserId}`)
            .set('Authorization', auth())
            .expect(200)

        const after = await http()
            .get(`/api/project/${otherProjectId}/members`)
            .set('Authorization', auth())
            .expect(200)
        expect(after.body).toEqual([])
        expect((await listProjects()).get(otherProjectId)?.memberCount).toBe(0)
        await http().get(`/api/project/${otherProjectId}`).set('Authorization', `Bearer ${memberToken}`).expect(404)
        await http()
            .get(`/api/project/${otherProjectId}/members`)
            .set('Authorization', `Bearer ${memberToken}`)
            .expect(404)
    })

    it('counts users with implicit access through super admin role or the projects.all permission', async () => {
        const before = await implicitAccess()

        await seedUser(
            app,
            { email: 'project.implicit.admin@example.com', password: 'correct-horse-battery-staple' },
            'admin',
        )
        const grantedCredentials: Credentials = {
            email: 'project.implicit.granted@example.com',
            password: 'correct-horse-battery-staple',
        }
        await seedUser(app, grantedCredentials, 'user')
        await seedUser(
            app,
            { email: 'project.implicit.plain@example.com', password: 'correct-horse-battery-staple' },
            'user',
        )
        const users = await http().get('/api/user').set('Authorization', auth()).expect(200)
        const grantedUserId = (users.body as { userId: number; email: string }[]).find(
            (user) => user.email === grantedCredentials.email,
        )!.userId
        await http()
            .put(`/api/user/${grantedUserId}/permissions`)
            .set('Authorization', auth())
            .send({ permissions: ['projects.all'] })
            .expect(200)

        expect(await implicitAccess()).toEqual({
            superAdminCount: before.superAdminCount,
            allProjectsUserCount: before.allProjectsUserCount + 2,
        })

        await seedUser(app, { email: 'project.implicit.super@example.com', password: 'correct-horse-battery-staple' })

        expect(await implicitAccess()).toEqual({
            superAdminCount: before.superAdminCount + 1,
            allProjectsUserCount: before.allProjectsUserCount + 2,
        })
    })

    it('unassigns a domain that no form uses', async () => {
        const domainResponse = await http()
            .post('/api/domain')
            .set('Authorization', auth())
            .send({ fqdn: 'forms.unused-project-example.com' })
            .expect(201)
        const unusedDomainId = (domainResponse.body as { domainId: number }).domainId

        await http()
            .post(`/api/project/${otherProjectId}/domains`)
            .set('Authorization', auth())
            .send({ domainId: unusedDomainId })
            .expect(201)
        await http()
            .delete(`/api/project/${otherProjectId}/domains/${unusedDomainId}`)
            .set('Authorization', auth())
            .expect(200)

        const detail = await http().get(`/api/project/${otherProjectId}`).set('Authorization', auth()).expect(200)
        expect((detail.body as { domains: unknown[] }).domains).toEqual([])
    })

    it('renames a project and validates the name', async () => {
        const renamed = await http()
            .patch(`/api/project/${otherProjectId}`)
            .set('Authorization', auth())
            .send({ name: 'E2E Other Renamed' })
            .expect(200)
        expect(renamed.body).toMatchObject({ projectId: otherProjectId, name: 'E2E Other Renamed' })

        await http().post('/api/project').set('Authorization', auth()).send({ name: '' }).expect(400)
        await http().patch('/api/project/999999').set('Authorization', auth()).send({ name: 'Ghost' }).expect(404)
    })

    it.each([
        ['get', '/api/project'],
        ['post', '/api/project'],
        ['get', '/api/project/deleted'],
        ['get', '/api/project/1'],
        ['patch', '/api/project/1'],
        ['delete', '/api/project/1'],
        ['post', '/api/project/1/restore'],
        ['post', '/api/project/1/domains'],
        ['delete', '/api/project/1/domains/1'],
        ['get', '/api/project/1/members'],
        ['get', '/api/project/1/implicit-access'],
        ['put', '/api/project/1/members/1'],
        ['delete', '/api/project/1/members/1'],
    ] as const)('rejects %s %s without a token', async (method, path) => {
        const response = await http()[method](path)

        expect(response.status).toBe(401)
    })

    it.each([
        ['get', '/api/project/abc'],
        ['patch', '/api/project/abc'],
        ['delete', '/api/project/abc'],
        ['post', '/api/project/abc/restore'],
        ['post', '/api/project/abc/domains'],
        ['delete', '/api/project/1/domains/abc'],
        ['get', '/api/project/abc/members'],
        ['get', '/api/project/abc/implicit-access'],
        ['put', '/api/project/1/members/abc'],
        ['delete', '/api/project/1/members/abc'],
    ] as const)('rejects %s %s with a non-numeric id with 400', async (method, path) => {
        const response = await http()[method](path).set('Authorization', auth()).send({})

        expect(response.status).toBe(400)
    })

    it('rejects properties a project update does not accept', async () => {
        const response = await http()
            .patch(`/api/project/${otherProjectId}`)
            .set('Authorization', auth())
            .send({ name: 'E2E Other Hijacked', projectId: 1, deletedAt: null })

        expect(response.status).toBe(400)
        const detail = await http().get(`/api/project/${otherProjectId}`).set('Authorization', auth()).expect(200)
        expect((detail.body as { name: string }).name).not.toBe('E2E Other Hijacked')
    })
})
