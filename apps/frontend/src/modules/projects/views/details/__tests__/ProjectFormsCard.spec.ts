import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboundFormApi, ProjectApi, type InboundFormDto, type ProjectDetailDto } from 'api'
import ProjectFormsCard from '../partials/ProjectFormsCard.vue'
import { mountView } from '@/__tests__/support.ts'

vi.stubGlobal('visualViewport', undefined)

const project: ProjectDetailDto = {
    projectId: 1,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    domains: [],
}

const forms: InboundFormDto[] = [
    {
        inboundFormId: 7,
        projectId: 1,
        domainId: null,
        name: 'Contact',
        slug: 'contact',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
        inboundFormId: 8,
        projectId: 1,
        domainId: null,
        name: 'Newsletter',
        slug: 'newsletter',
        isActive: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('ProjectFormsCard', () => {
    it('lists the forms of the project', async () => {
        const listSpy = vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue(forms)
        vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(project)
        const wrapper = mountView(ProjectFormsCard, { props: { project } })

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Newsletter')
        })
        expect(wrapper.text()).toContain('Contact')
        expect(listSpy).toHaveBeenCalledWith({ query: { projectId: 1 } })
    })

    it('shows the empty hint when the project has no forms', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([])
        vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(project)
        const wrapper = mountView(ProjectFormsCard, { props: { project } })

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('No forms in this project yet.')
        })
    })

    it('offers adding forms to members with update rights', () => {
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([])
        vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(project)
        const wrapper = mountView(ProjectFormsCard, { props: { project } }, [
            { action: ['read', 'update'], subject: 'Project', conditions: { projectId: 1 } },
        ])

        expect(wrapper.findAll('button').map((button) => button.text())).toContain('Add')
    })

    it('hides adding forms from read-only members', () => {
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([])
        const wrapper = mountView(ProjectFormsCard, { props: { project } }, [
            { action: 'read', subject: 'Project', conditions: { projectId: 1 } },
        ])

        expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Add')
    })
})
