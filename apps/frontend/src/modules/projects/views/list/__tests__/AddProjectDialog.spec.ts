import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { ProjectApi, type ProjectDto } from 'api'
import type { Router } from 'vue-router'
import AddProjectDialog from '../partials/AddProjectDialog.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', undefined)
enableAutoUnmount(afterEach)

const project: ProjectDto = {
    projectId: 4,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
})

function dialog() {
    return new DOMWrapper(document.body).get('.v-overlay__content')
}

async function openDialog() {
    const wrapper = mountView(AddProjectDialog, {
        slots: {
            default: (scope: { props: Record<string, unknown> }) => h('button', { class: 'open', ...scope.props }),
        },
    })
    await wrapper.get('button.open').trigger('click')
    await flushPromises()
    return wrapper
}

describe('AddProjectDialog', () => {
    it('creates the project and opens its details', async () => {
        const createSpy = vi.spyOn(ProjectApi, 'createProject').mockResolvedValue(project)
        await openDialog()

        await dialog().get('input[name="name"]').setValue('Acme')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(push).toHaveBeenCalledWith({ name: RouteNames.PROJECT_DETAILS, params: { projectId: 4 } })
        })
        expect(createSpy).toHaveBeenCalledWith({ body: { name: 'Acme' } })
    })

    it('requires a name', async () => {
        const createSpy = vi.spyOn(ProjectApi, 'createProject')
        await openDialog()

        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().find('.v-input--error input[name="name"]').exists()).toBe(true)
        })
        expect(createSpy).not.toHaveBeenCalled()
    })

    it('shows the api error and stays on the page when creation fails', async () => {
        vi.spyOn(ProjectApi, 'createProject').mockRejectedValue({ message: 'Project limit reached' })
        await openDialog()

        await dialog().get('input[name="name"]').setValue('Acme')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().get('.v-alert').text()).toContain('Project limit reached')
        })
        expect(push).not.toHaveBeenCalled()
    })

    it('falls back to a generic error message', async () => {
        vi.spyOn(ProjectApi, 'createProject').mockRejectedValue(null)
        await openDialog()

        await dialog().get('input[name="name"]').setValue('Acme')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().get('.v-alert').text()).toContain('The project could not be created')
        })
    })
})
