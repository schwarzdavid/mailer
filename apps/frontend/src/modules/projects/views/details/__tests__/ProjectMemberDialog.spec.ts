import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi, UserApi } from 'api'
import ProjectMemberDialog from '../partials/ProjectMemberDialog.vue'
import { mountDialog, overlayButton, overlayText } from '@/__tests__/support.ts'
import { member, projectDetail, userListItem } from '@/__tests__/fixtures.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('ProjectMemberDialog', () => {
    it('edits the permissions of an existing member', async () => {
        const setSpy = vi.spyOn(ProjectApi, 'setProjectMember').mockResolvedValue(undefined)
        const existing = member()
        const { open } = mountDialog(ProjectMemberDialog, {
            project: projectDetail(),
            member: existing,
            existing: [existing],
        })

        await vi.waitFor(() => expect(overlayText()).toContain("Edit Lisa Schneider's access"))
        expect(overlayText()).toContain('Lisa Schneider · lisa@acme.com')
        document.body.querySelector<HTMLInputElement>('.v-overlay-container input[value="delete"]')!.click()
        overlayButton('Save').click()

        await vi.waitFor(() =>
            expect(setSpy).toHaveBeenCalledWith({
                path: { projectId: 1, userId: 2 },
                body: { permissions: ['read', 'update', 'delete'] },
            }),
        )
        await vi.waitFor(() => expect(open.value).toBe(false))
    })

    it('requires a user when adding', async () => {
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue([userListItem()])
        const setSpy = vi.spyOn(ProjectApi, 'setProjectMember')
        mountDialog(ProjectMemberDialog, { project: projectDetail(), existing: [] })

        await vi.waitFor(() => expect(overlayText()).toContain('Access in Acme Website'))
        overlayButton('Add member').click()

        await vi.waitFor(() => expect(overlayText()).toContain('Choose a user.'))
        expect(setSpy).not.toHaveBeenCalled()
    })

    it('requires at least one permission', async () => {
        const setSpy = vi.spyOn(ProjectApi, 'setProjectMember')
        const existing = member({ permissions: ['read'] })
        mountDialog(ProjectMemberDialog, { project: projectDetail(), member: existing, existing: [existing] })

        await vi.waitFor(() => expect(overlayText()).toContain('Access in Acme Website'))
        document.body.querySelector<HTMLInputElement>('.v-overlay-container input[value="read"]')!.click()
        overlayButton('Save').click()

        await vi.waitFor(() => expect(overlayText()).toContain('Choose at least one permission.'))
        expect(setSpy).not.toHaveBeenCalled()
    })

    it('shows the error inside the dialog when saving fails', async () => {
        vi.spyOn(ProjectApi, 'setProjectMember').mockRejectedValue({ message: 'Cannot change your own access' })
        const existing = member()
        const { open } = mountDialog(ProjectMemberDialog, {
            project: projectDetail(),
            member: existing,
            existing: [existing],
        })

        await vi.waitFor(() => expect(overlayText()).toContain('Access in Acme Website'))
        overlayButton('Save').click()

        await vi.waitFor(() => expect(overlayText()).toContain('Cannot change your own access'))
        expect(open.value).toBe(true)
    })
})
