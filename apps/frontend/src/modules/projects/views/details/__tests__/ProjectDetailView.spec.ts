import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi, InboundFormApi, ProjectApi, type InboundFormDto, type ProjectDetailDto } from 'api'
import type { Router } from 'vue-router'
import ProjectDetailView from '../ProjectDetailView.vue'
import { mountView } from '@/__tests__/support.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return {
        ...actual,
        useRoute: () => ({ params: { projectId: '1' } }),
        useRouter: () => ({ push }),
    }
})

const project: ProjectDetailDto = {
    projectId: 1,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    domains: [],
}

const forms: InboundFormDto[] = [
    {
        inboundFormId: 1,
        projectId: 1,
        domainId: null,
        name: 'Contact',
        slug: 'contact',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
]

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
})

describe('ProjectDetailView', () => {
    it('renders the project with its domains and forms sections', async () => {
        vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(project)
        vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue([])
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue(forms)
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([])
        const wrapper = mountView(ProjectDetailView)

        await vi.waitFor(() => {
            expect(wrapper.get('h1').text()).toBe('Acme')
        })
        expect(wrapper.text()).toContain('No domains assigned yet')
        expect(wrapper.text()).toContain('Contact')
    })
})
