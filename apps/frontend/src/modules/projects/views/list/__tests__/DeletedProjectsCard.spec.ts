import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ProjectApi, type DeletedProjectDto } from 'api'
import DeletedProjectsCard from '../partials/DeletedProjectsCard.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const deleted: DeletedProjectDto[] = [
    {
        projectId: 2,
        name: 'Old Project',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-20T00:00:00.000Z'),
        deletedAt: new Date('2026-06-20T00:00:00.000Z'),
        purgeAt: new Date('2026-07-20T00:00:00.000Z'),
    },
    {
        projectId: 3,
        name: 'Older Project',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-10T00:00:00.000Z'),
        deletedAt: new Date('2026-06-10T00:00:00.000Z'),
        purgeAt: new Date('2026-07-10T00:00:00.000Z'),
    },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('DeletedProjectsCard', () => {
    it('renders nothing when the trash is empty', async () => {
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue([])
        const wrapper = mountView(DeletedProjectsCard)

        await flushPromises()

        expect(wrapper.text()).toBe('')
    })

    it('shows when each deleted project will be purged', async () => {
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue(deleted)
        const wrapper = mountView(DeletedProjectsCard)

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Old Project')
        })
        expect(wrapper.text()).toContain(
            `Will be permanently deleted on ${new Date('2026-07-20T00:00:00.000Z').toLocaleString()}`,
        )
    })

    it('restores the clicked project', async () => {
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue(deleted)
        const restoreSpy = vi.spyOn(ProjectApi, 'restoreProject').mockResolvedValue(deleted[1])
        const wrapper = mountView(DeletedProjectsCard)
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Older Project')
        })

        const card = wrapper.findAll('.v-card').find((candidate) => candidate.text().includes('Older Project'))!
        await card.get('button').trigger('click')

        await vi.waitFor(() => {
            expect(restoreSpy).toHaveBeenCalledWith({ path: { projectId: 3 } })
        })
    })

    it('shows the api error when restoring fails', async () => {
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue(deleted)
        vi.spyOn(ProjectApi, 'restoreProject').mockRejectedValue({ message: 'Project was already purged' })
        const wrapper = mountView(DeletedProjectsCard)
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Older Project')
        })

        const card = wrapper.findAll('.v-card').find((candidate) => candidate.text().includes('Older Project'))!
        await card.get('button').trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('Project was already purged')
        })
        expect(card.get('button').classes()).not.toContain('v-btn--loading')
    })

    it('falls back to a generic message when restoring fails without one', async () => {
        vi.spyOn(ProjectApi, 'getDeletedProjects').mockResolvedValue(deleted)
        vi.spyOn(ProjectApi, 'restoreProject').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = mountView(DeletedProjectsCard)
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Older Project')
        })

        await wrapper.get('.v-card button').trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('The project could not be restored')
        })
    })
})
