import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiKeyApi, DomainApi, InboundFormApi, ProjectApi } from 'api'
import ProjectDetailView from '../ProjectDetailView.vue'
import { createTestRouter, findButton, mountView } from '@/__tests__/support.ts'
import { apiKey, formListItem, projectDetail, projectRoles } from '@/__tests__/fixtures.ts'
import { RouteNames } from '@/router/RouteNames.ts'

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRoute: () => ({ params: { projectId: '1' }, meta: {} }) }
})

vi.stubGlobal('visualViewport', null)

function mockProjectApis() {
    vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(projectDetail())
    vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue([])
    vi.spyOn(ProjectApi, 'getProjectImplicitAccess').mockResolvedValue({ superAdminCount: 1, allProjectsUserCount: 0 })
    vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([formListItem()])
    vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([])
    vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue([apiKey()])
    vi.spyOn(ProjectApi, 'getProjectRoles').mockResolvedValue(projectRoles())
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('ProjectDetailView', () => {
    it('renders the cards in their working order', async () => {
        mockProjectApis()
        const wrapper = mountView(ProjectDetailView)

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toBe('Acme Website'))
        await vi.waitFor(() => expect(wrapper.text()).toContain('Contact request'))
        const titles = wrapper.findAll('h2').map((heading) => heading.text().replace(/\s*\d+$/, ''))
        expect(titles).toEqual(['Inbound forms', 'Sender domains', 'Members', 'API keys', 'General', 'Delete project'])
        expect(wrapper.get('.page-header__meta').text()).toContain('1 form')
        expect(wrapper.get('.page-header__meta').text()).toContain('No sender domain')
        expect(wrapper.text()).toContain('Projects')
    })

    it('shows a read-only project without edit controls', async () => {
        mockProjectApis()
        const wrapper = mountView(ProjectDetailView, {}, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toContain('Acme Website'))
        expect(wrapper.text()).toContain('Read only')
        expect(wrapper.text()).toContain('You can view this project')
        expect(findButton(wrapper, 'New form')).toBeUndefined()
        expect(findButton(wrapper, 'Save')).toBeUndefined()
        expect(wrapper.text()).not.toContain('Delete project')
        expect(wrapper.text()).not.toContain('Members')
    })

    it('lets an editor add forms but not rename or delete the project', async () => {
        mockProjectApis()
        const wrapper = mountView(ProjectDetailView, {}, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
            { action: 'forms.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        await vi.waitFor(() => expect(wrapper.text()).toContain('Contact request'))
        expect(wrapper.text()).not.toContain('Read only')
        expect(findButton(wrapper, 'New form')).toBeDefined()
        expect(findButton(wrapper, 'New API key')).toBeUndefined()
        expect(findButton(wrapper, 'Save')).toBeUndefined()
        expect(wrapper.text()).not.toContain('Delete project')
        expect(wrapper.text()).not.toContain('Members')
    })

    it('lets an API key manager create keys but nothing else', async () => {
        mockProjectApis()
        const wrapper = mountView(ProjectDetailView, {}, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
            { action: 'api_keys.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        await vi.waitFor(() => expect(findButton(wrapper, 'New API key')).toBeDefined())
        expect(findButton(wrapper, 'New form')).toBeUndefined()
        expect(findButton(wrapper, 'Save')).toBeUndefined()
        expect(wrapper.text()).not.toContain('Delete project')
        expect(wrapper.text()).not.toContain('Members')
    })

    it('lets a member manager see the members card without form or key controls', async () => {
        mockProjectApis()
        const wrapper = mountView(ProjectDetailView, {}, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
            { action: 'members.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        await vi.waitFor(() =>
            expect(wrapper.findAll('h2').map((heading) => heading.text().replace(/\s*\d+$/, ''))).toContain('Members'),
        )
        expect(findButton(wrapper, 'New form')).toBeUndefined()
        expect(findButton(wrapper, 'New API key')).toBeUndefined()
        expect(wrapper.text()).not.toContain('Read only')
    })

    it('shows the API keys card to every project reader', async () => {
        mockProjectApis()
        const wrapper = mountView(ProjectDetailView, {}, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        await vi.waitFor(() => expect(wrapper.text()).toContain('Newsletter'))
        const titles = wrapper.findAll('h2').map((heading) => heading.text().replace(/\s*\d+$/, ''))
        expect(titles).toContain('API keys')
        expect(findButton(wrapper, 'New API key')).toBeUndefined()
    })

    it('links every project reader to the sent mail', async () => {
        mockProjectApis()
        const router = createTestRouter()
        router.addRoute({
            path: '/projects/:projectId/messages',
            name: RouteNames.PROJECT_MESSAGES,
            component: { render: () => null },
        })
        const wrapper = mountView(ProjectDetailView, { global: { plugins: [router] } }, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toContain('Acme Website'))
        expect(findButton(wrapper, 'Sent mail')?.attributes('href')).toBe('/projects/1/messages')
    })

    it('shows the not-found state for a missing project', async () => {
        vi.spyOn(ProjectApi, 'getProject').mockRejectedValue({ statusCode: 404, message: 'Not found' })
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([])
        const wrapper = mountView(ProjectDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("This project doesn't exist"))
        expect(findButton(wrapper, 'Back to projects')).toBeDefined()
    })

    it('offers a retry when loading fails', async () => {
        vi.spyOn(ProjectApi, 'getProject').mockRejectedValue({ statusCode: 503, message: 'Unavailable' })
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([])
        const wrapper = mountView(ProjectDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't load project"))
        expect(findButton(wrapper, 'Try again')).toBeDefined()
    })
})
