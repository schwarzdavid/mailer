import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi } from 'api'
import type { Router } from 'vue-router'
import ProjectDangerZone from '../partials/ProjectDangerZone.vue'
import { findButton, mountInApp, overlayButton, overlayText } from '@/__tests__/support.ts'
import { projectDetail } from '@/__tests__/fixtures.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

const notifications = useNotificationHost()

afterEach(() => {
    vi.restoreAllMocks()
    push.mockReset()
    notifications.dismiss()
    document.body.innerHTML = ''
})

describe('ProjectDangerZone', () => {
    it('spells out the consequences', () => {
        const wrapper = mountInApp(ProjectDangerZone, { project: projectDetail(), formCount: 3 })

        expect(wrapper.text()).toContain('Moves Acme Website and its 3 forms to Recently deleted.')
    })

    it('deletes the project after confirmation and returns to the list', async () => {
        push.mockResolvedValue(undefined)
        const deleteSpy = vi.spyOn(ProjectApi, 'deleteProject').mockResolvedValue(undefined)
        const wrapper = mountInApp(ProjectDangerZone, { project: projectDetail(), formCount: 1 })

        await findButton(wrapper, 'Delete project…')!.trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Delete project “Acme Website”?'))
        overlayButton('Delete project').click()

        await vi.waitFor(() => expect(push).toHaveBeenCalledWith({ name: RouteNames.PROJECT_LIST }))
        expect(deleteSpy).toHaveBeenCalledWith({ path: { projectId: 1 } })
        await vi.waitFor(() => expect(notifications.current.value?.text).toBe('Acme Website moved to Recently deleted'))
    })

    it('does nothing when cancelled', async () => {
        const deleteSpy = vi.spyOn(ProjectApi, 'deleteProject')
        const wrapper = mountInApp(ProjectDangerZone, { project: projectDetail(), formCount: 1 })

        await findButton(wrapper, 'Delete project…')!.trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Delete project “Acme Website”?'))
        overlayButton('Cancel').click()

        await vi.waitFor(() => expect(document.body.querySelector('.confirm-dialog')).toBeNull())
        expect(deleteSpy).not.toHaveBeenCalled()
        expect(push).not.toHaveBeenCalled()
    })
})
