import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi } from 'api'
import ProjectMembersCard from '../partials/ProjectMembersCard.vue'
import { mountInApp } from '@/__tests__/support.ts'
import { member, projectDetail, projectRoles } from '@/__tests__/fixtures.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'

vi.stubGlobal('visualViewport', null)

const notifications = useNotificationHost()

afterEach(() => {
    vi.restoreAllMocks()
    notifications.dismiss()
    document.body.innerHTML = ''
})

function mockMembers() {
    vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue([member({ permissions: ['delete'] })])
    vi.spyOn(ProjectApi, 'getProjectImplicitAccess').mockResolvedValue({ superAdminCount: 1, allProjectsUserCount: 2 })
    vi.spyOn(ProjectApi, 'getProjectRoles').mockResolvedValue(projectRoles())
}

describe('ProjectMembersCard', () => {
    it('lists members with their role and extra permissions', async () => {
        mockMembers()
        const wrapper = mountInApp(ProjectMembersCard, { project: projectDetail() })

        await vi.waitFor(() => expect(wrapper.text()).toContain('Lisa Schneider'))
        expect(wrapper.text()).toContain('lisa@acme.com')
        const tags = wrapper.findAll('.tag-label').map((tag) => tag.text())
        expect(tags).toEqual(['Maintainer', 'Delete project'])
    })

    it('names who else can open the project', async () => {
        mockMembers()
        const wrapper = mountInApp(ProjectMembersCard, { project: projectDetail() })

        await vi.waitFor(() =>
            expect(wrapper.text()).toContain(
                'Also open to 1 Super admin and 2 users with “Access all projects”, without membership.',
            ),
        )
        expect(wrapper.text()).toContain('Manage in Users')
    })

    it('removes a member after the undo window', async () => {
        mockMembers()
        const removeSpy = vi.spyOn(ProjectApi, 'removeProjectMember').mockResolvedValue(undefined)
        const wrapper = mountInApp(ProjectMembersCard, { project: projectDetail() })
        await vi.waitFor(() => expect(wrapper.text()).toContain('Lisa Schneider'))

        await wrapper.get('button[aria-label="Remove Lisa Schneider"]').trigger('click')

        expect(wrapper.find('button[aria-label="Remove Lisa Schneider"]').exists()).toBe(false)
        expect(notifications.current.value?.text).toBe('Lisa Schneider removed')
        notifications.dismiss()
        await vi.waitFor(() => expect(removeSpy).toHaveBeenCalledWith({ path: { projectId: 1, userId: 2 } }))
    })

    it('brings the member back with a retry when removing fails', async () => {
        mockMembers()
        vi.spyOn(ProjectApi, 'removeProjectMember').mockRejectedValue({ message: 'Forbidden' })
        const wrapper = mountInApp(ProjectMembersCard, { project: projectDetail() })
        await vi.waitFor(() => expect(wrapper.text()).toContain('Lisa Schneider'))

        await wrapper.get('button[aria-label="Remove Lisa Schneider"]').trigger('click')
        notifications.dismiss()

        await vi.waitFor(() => expect(notifications.current.value?.text).toBe("Couldn't remove Lisa Schneider"))
        expect(notifications.current.value?.retry).toBeDefined()
        expect(wrapper.find('button[aria-label="Remove Lisa Schneider"]').exists()).toBe(true)
    })

    it('explains an empty member list', async () => {
        vi.spyOn(ProjectApi, 'getProjectMembers').mockResolvedValue([])
        vi.spyOn(ProjectApi, 'getProjectImplicitAccess').mockResolvedValue({
            superAdminCount: 0,
            allProjectsUserCount: 0,
        })
        const wrapper = mountInApp(ProjectMembersCard, { project: projectDetail() })

        await vi.waitFor(() => expect(wrapper.text()).toContain('No members yet'))
    })
})
