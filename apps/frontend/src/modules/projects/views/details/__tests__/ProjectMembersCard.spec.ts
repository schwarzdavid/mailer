import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi, UserApi, type ProjectMemberDto } from 'api'
import ProjectMembersCard from '../partials/ProjectMembersCard.vue'
import { mountView } from '@/__tests__/support.ts'

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
})
