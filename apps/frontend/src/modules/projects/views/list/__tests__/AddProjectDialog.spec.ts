import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ProjectApi, type ProjectDto } from 'api'
import type { Router } from 'vue-router'
import AddProjectDialog from '../partials/AddProjectDialog.vue'
import { mountDialog, overlayText, setOverlayInput, submitOverlayForm } from '@/__tests__/support.ts'
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

const project: ProjectDto = {
    projectId: 4,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

const notifications = useNotificationHost()

afterEach(() => {
    vi.restoreAllMocks()
    push.mockReset()
    notifications.dismiss()
    document.body.innerHTML = ''
})

async function openDialog() {
    const result = mountDialog(AddProjectDialog)
    await vi.waitFor(() => expect(document.body.querySelector('input[name="name"]')).not.toBeNull())
    return result
}

describe('AddProjectDialog', () => {
    it('creates the project, opens it and confirms', async () => {
        push.mockResolvedValue(undefined)
        const createSpy = vi.spyOn(ProjectApi, 'createProject').mockResolvedValue(project)
        const { open } = await openDialog()

        await setOverlayInput('name', 'Acme')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(push).toHaveBeenCalledWith({ name: RouteNames.PROJECT_DETAILS, params: { projectId: 4 } }),
        )
        expect(createSpy).toHaveBeenCalledWith({ body: { name: 'Acme' } })
        expect(open.value).toBe(false)
        await vi.waitFor(() => expect(notifications.current.value?.text).toBe('Project created'))
    })

    it('asks for a name before creating', async () => {
        const createSpy = vi.spyOn(ProjectApi, 'createProject')
        await openDialog()

        submitOverlayForm()
        await flushPromises()

        await vi.waitFor(() => expect(overlayText()).toContain('Enter a name for the project.'))
        expect(createSpy).not.toHaveBeenCalled()
    })

    it('keeps the input and shows the error when creating fails', async () => {
        vi.spyOn(ProjectApi, 'createProject').mockRejectedValue({ message: 'Name already taken' })
        const { open } = await openDialog()

        await setOverlayInput('name', 'Acme')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Name already taken'))
        expect(open.value).toBe(true)
        expect(push).not.toHaveBeenCalled()
    })
})
