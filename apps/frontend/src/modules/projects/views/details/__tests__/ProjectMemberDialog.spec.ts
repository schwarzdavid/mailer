import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApi, ProjectApi, UserApi } from 'api'
import ProjectMemberDialog from '../partials/ProjectMemberDialog.vue'
import { mountDialog, overlayButton, overlayText } from '@/__tests__/support.ts'
import { member, projectDetail, projectRoles, userListItem } from '@/__tests__/fixtures.ts'
import { signedIn } from '@/modules/users/views/__tests__/userFixtures.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

const maintainerRules = [
    { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'update', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'forms.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'api_keys.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'members.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
    { action: 'read', subject: 'User' },
]

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function mockRoles() {
    vi.spyOn(ProjectApi, 'getProjectRoles').mockResolvedValue(projectRoles())
}

async function roleOptions() {
    document.body
        .querySelector<HTMLElement>('.v-overlay-container [data-testid="roleId"] .v-field')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await vi.waitFor(() => expect(document.body.querySelectorAll('.v-list-item-title').length).toBeGreaterThan(0))
    return [...document.body.querySelectorAll('.v-list-item-title')].map((title) => title.textContent?.trim())
}

describe('ProjectMemberDialog', () => {
    it('pre-selects the smallest grantable role when adding and sends it', async () => {
        mockRoles()
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue([userListItem()])
        const setSpy = vi.spyOn(ProjectApi, 'setProjectMember').mockResolvedValue(undefined)
        const { open } = mountDialog(ProjectMemberDialog, { project: projectDetail(), existing: [] })

        await vi.waitFor(() => expect(overlayText()).toContain('Sees the project, its forms and sent mail.'))
        document.body
            .querySelector<HTMLElement>('.v-overlay-container .v-autocomplete .v-field')!
            .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await vi.waitFor(() => expect(overlayText()).toContain('Tom Becker'))
        ;[...document.body.querySelectorAll<HTMLElement>('.v-list-item')]
            .find((item) => item.textContent?.includes('Tom Becker'))!
            .click()
        overlayButton('Add member').click()

        await vi.waitFor(() =>
            expect(setSpy).toHaveBeenCalledWith({
                path: { projectId: 1, userId: 3 },
                body: { roleId: 5, permissions: [] },
            }),
        )
        await vi.waitFor(() => expect(open.value).toBe(false))
    })

    it('offers neither the signed-in user nor users with access to all projects', async () => {
        mockRoles()
        vi.spyOn(AuthApi, 'currentUser').mockResolvedValue(signedIn('user', 4))
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue([
            userListItem(),
            userListItem({ userId: 4, firstName: 'Ada', lastName: 'Lovelace' }),
            userListItem({ userId: 5, firstName: 'Lisa', lastName: 'Schneider', allProjects: true }),
        ])
        mountDialog(ProjectMemberDialog, { project: projectDetail(), existing: [] })

        await vi.waitFor(() => expect(overlayText()).toContain('Access in Acme Website'))
        document.body
            .querySelector<HTMLElement>('.v-overlay-container .v-autocomplete .v-field')!
            .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await vi.waitFor(() => expect(overlayText()).toContain('Tom Becker'))

        expect(overlayText()).not.toContain('Ada Lovelace')
        expect(overlayText()).not.toContain('Lisa Schneider')
    })

    it('pre-selects the smallest grantable role even when it is not listed first', async () => {
        vi.spyOn(ProjectApi, 'getProjectRoles').mockResolvedValue([...projectRoles()].reverse())
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue([userListItem()])
        mountDialog(ProjectMemberDialog, { project: projectDetail(), existing: [] })

        await vi.waitFor(() =>
            expect(
                document.body
                    .querySelector('.v-overlay-container [data-testid="roleId"] .v-select__selection')
                    ?.textContent?.trim(),
            ).toBe('Viewer'),
        )
    })

    it('explains instead of offering an empty role list when no role is grantable', async () => {
        vi.spyOn(ProjectApi, 'getProjectRoles').mockResolvedValue(
            projectRoles().filter((role) => role.permissions.length > 1),
        )
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue([userListItem()])
        mountDialog(ProjectMemberDialog, { project: projectDetail(), existing: [] }, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
            { action: 'members.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        await vi.waitFor(() => expect(overlayText()).toContain("You can't assign a role here"))
        expect(overlayText()).toContain("You hold none of this project's roles in full.")
        expect(document.body.querySelector('.v-overlay-container [data-testid="roleId"]')).toBeNull()
        expect(document.body.querySelector('.v-overlay-container button[type="submit"]')).toBeNull()
        expect(() => overlayButton('Add member')).toThrow('No overlay button labelled "Add member"')
        expect(document.body.querySelector('.v-overlay-container [name="userId"]')).toBeNull()
        expect(document.body.querySelector('.v-overlay-container input[type="checkbox"]')).toBeNull()
        expect(overlayText()).not.toContain('Advanced: additional permissions')
    })

    it('offers only roles the caller fully holds on this project, plus the current one', async () => {
        mockRoles()
        const existing = member({ role: { roleId: 8, name: 'Owner' } })
        mountDialog(
            ProjectMemberDialog,
            { project: projectDetail(), member: existing, existing: [existing] },
            maintainerRules,
        )

        await vi.waitFor(() => expect(overlayText()).toContain("Edit Lisa Schneider's access"))
        expect(await roleOptions()).toEqual(['Viewer', 'Editor', 'Maintainer', 'Owner'])
    })

    it('leaves out roles the caller does not fully hold on this project', async () => {
        mockRoles()
        const existing = member({ role: { roleId: 5, name: 'Viewer' } })
        mountDialog(
            ProjectMemberDialog,
            { project: projectDetail(), member: existing, existing: [existing] },
            maintainerRules,
        )

        await vi.waitFor(() => expect(overlayText()).toContain("Edit Lisa Schneider's access"))
        expect(await roleOptions()).toEqual(['Viewer', 'Editor', 'Maintainer'])
    })

    it('keeps extras collapsed, locks role permissions and sends the extras', async () => {
        mockRoles()
        const setSpy = vi.spyOn(ProjectApi, 'setProjectMember').mockResolvedValue(undefined)
        const existing = member({ role: { roleId: 5, name: 'Viewer' } })
        mountDialog(ProjectMemberDialog, { project: projectDetail(), member: existing, existing: [existing] })

        await vi.waitFor(() => expect(overlayText()).toContain("Edit Lisa Schneider's access"))
        expect(document.body.querySelector('.v-overlay-container input[value="delete"]')).toBeNull()
        overlayButton('Advanced: additional permissions').click()
        await vi.waitFor(() =>
            expect(document.body.querySelector('.v-overlay-container input[value="delete"]')).not.toBeNull(),
        )
        const read = document.body.querySelector<HTMLInputElement>('.v-overlay-container input[value="read"]')!
        expect(read.checked).toBe(true)
        expect(read.disabled).toBe(true)
        expect(overlayText()).toContain('From role: Viewer')

        document.body.querySelector<HTMLInputElement>('.v-overlay-container input[value="delete"]')!.click()
        overlayButton('Save').click()

        await vi.waitFor(() =>
            expect(setSpy).toHaveBeenCalledWith({
                path: { projectId: 1, userId: 2 },
                body: { roleId: 5, permissions: ['delete'] },
            }),
        )
    })

    it('disables extras the caller does not hold on the project', async () => {
        mockRoles()
        const existing = member({ role: { roleId: 5, name: 'Viewer' } })
        mountDialog(
            ProjectMemberDialog,
            { project: projectDetail(), member: existing, existing: [existing] },
            maintainerRules,
        )

        await vi.waitFor(() => expect(overlayText()).toContain("Edit Lisa Schneider's access"))
        overlayButton('Advanced: additional permissions').click()
        await vi.waitFor(() =>
            expect(document.body.querySelector('.v-overlay-container input[value="delete"]')).not.toBeNull(),
        )

        expect(
            document.body.querySelector<HTMLInputElement>('.v-overlay-container input[value="delete"]')!.disabled,
        ).toBe(true)
        expect(
            document.body.querySelector<HTMLInputElement>('.v-overlay-container input[value="forms.manage"]')!.disabled,
        ).toBe(false)
    })

    it('requires a user when adding', async () => {
        mockRoles()
        vi.spyOn(UserApi, 'getUsers').mockResolvedValue([userListItem()])
        const setSpy = vi.spyOn(ProjectApi, 'setProjectMember')
        mountDialog(ProjectMemberDialog, { project: projectDetail(), existing: [] })

        await vi.waitFor(() => expect(overlayText()).toContain('Access in Acme Website'))
        overlayButton('Add member').click()

        await vi.waitFor(() => expect(overlayText()).toContain('Choose a user.'))
        expect(setSpy).not.toHaveBeenCalled()
    })

    it('shows the error inside the dialog when saving fails', async () => {
        mockRoles()
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
