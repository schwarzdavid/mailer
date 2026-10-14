import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi, UserApi, type ProjectMemberDto } from 'api'
import ProjectMembersCard from '../partials/ProjectMembersCard.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const members: ProjectMemberDto[] = [
    { userId: 2, firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com', permissions: ['read', 'update'] },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('ProjectMembersCard', () => {
    it('lists members with their levels for managers', async () => {
        vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue(members)
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue([])
        const wrapper = mountView(ProjectMembersCard, { props: { projectId: 1 } })

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })
        expect(wrapper.text()).toContain('Members')
    })

    it('renders nothing without manage rights', () => {
        const membersSpy = vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue(members)
        const wrapper = mountView(ProjectMembersCard, { props: { projectId: 1 } }, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        expect(wrapper.text()).toBe('')
        expect(membersSpy).not.toHaveBeenCalled()
    })

    it('removes a member', async () => {
        vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue(members)
        const removeSpy = vi.spyOn(ProjectApi, 'removeProjectMember').mockResolvedValue(undefined)
        const wrapper = mountView(ProjectMembersCard, { props: { projectId: 1 } })
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })

        const remove = wrapper.findAll('button').find((button) => button.find('.mdi-delete').exists())
        await remove!.trigger('click')

        await vi.waitFor(() => {
            expect(removeSpy).toHaveBeenCalledWith({ path: { projectId: 1, userId: 2 } })
        })
    })

    it('shows the api error when removing a member fails', async () => {
        vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue(members)
        vi.spyOn(ProjectApi, 'removeProjectMember').mockRejectedValue({ message: 'Cannot remove the last owner' })
        const wrapper = mountView(ProjectMembersCard, { props: { projectId: 1 } })
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })

        const remove = wrapper.findAll('button').find((button) => button.find('.mdi-delete').exists())
        await remove!.trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('Cannot remove the last owner')
        })
    })

    it('falls back to a generic message when removing a member fails without one', async () => {
        vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue(members)
        vi.spyOn(ProjectApi, 'removeProjectMember').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = mountView(ProjectMembersCard, { props: { projectId: 1 } })
        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })

        const remove = wrapper.findAll('button').find((button) => button.find('.mdi-delete').exists())
        await remove!.trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('The member could not be removed')
        })
    })

    it('lets project editors manage members but only offers adding to those who can list users', async () => {
        vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue(members)
        const wrapper = mountView(ProjectMembersCard, { props: { projectId: 1 } }, [
            { action: ['read', 'update'], subject: 'Project', conditions: { projectId: 1 } },
        ])

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Grace Hopper')
        })
        expect(wrapper.text()).toContain('Read')
        expect(wrapper.text()).toContain('Update')
        expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Add member')
    })

    it('shows the empty hint without members', async () => {
        vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue([])
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue([])
        const wrapper = mountView(ProjectMembersCard, { props: { projectId: 1 } })

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('No members yet.')
        })
        expect(wrapper.findAll('button').map((button) => button.text())).toContain('Add member')
    })
})
