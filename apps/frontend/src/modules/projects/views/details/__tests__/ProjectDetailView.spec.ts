import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi, InboundFormApi, ProjectApi } from 'api'
import ProjectDetailView from '../ProjectDetailView.vue'
import { findButton, mountView } from '@/__tests__/support.ts'
import { formListItem, projectDetail } from '@/__tests__/fixtures.ts'

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
        expect(titles).toEqual(['Inbound forms', 'Sender domains', 'Members', 'General', 'Delete project'])
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
