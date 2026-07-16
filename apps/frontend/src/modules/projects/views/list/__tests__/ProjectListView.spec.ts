import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi, type DeletedProjectDto, type ProjectListDto } from 'api'
import type { Router } from 'vue-router'
import ProjectListView from '../ProjectListView.vue'
import { mountView } from '@/__tests__/support.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

const projects: ProjectListDto[] = [
    {
        projectId: 1,
        name: 'Acme',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        inboundFormCount: 2,
        domainCount: 1,
    },
]

const deleted: DeletedProjectDto[] = [
    {
        projectId: 2,
        name: 'Old Project',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-20T00:00:00.000Z'),
        deletedAt: new Date('2026-06-20T00:00:00.000Z'),
        purgeAt: new Date('2026-07-20T00:00:00.000Z'),
    },
]

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
})

describe('ProjectListView', () => {
    it('renders one entry per project with its counts', async () => {
        vi.spyOn(ProjectApi, 'getProjects').mockResolvedValue(projects)
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue([])
        const wrapper = mountView(ProjectListView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Acme')
        })
        expect(wrapper.text()).toContain('2 forms · 1 domains')
        expect(wrapper.get('h1').text()).toBe('Projects')
    })

    it('lists recently deleted projects with a restore action', async () => {
        vi.spyOn(ProjectApi, 'getProjects').mockResolvedValue([])
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue(deleted)
        const wrapper = mountView(ProjectListView)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Old Project')
        })
        expect(wrapper.text()).toContain('Recently deleted')
        expect(wrapper.text()).toContain('Restore')
    })
})
