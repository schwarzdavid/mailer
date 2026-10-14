import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { ProjectApi, type ProjectDetailDto } from 'api'
import type { Router } from 'vue-router'
import DeleteProjectDialog from '../partials/DeleteProjectDialog.vue'
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

const project: ProjectDetailDto = {
    projectId: 1,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    domains: [],
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
})

function dialogButton(label: string) {
    return new DOMWrapper(document.body)
        .get('.v-overlay__content')
        .findAll('button')
        .find((button) => button.text() === label)!
}

async function openDialog() {
    const wrapper = mountView(DeleteProjectDialog, {
        props: { project },
        slots: {
            default: (scope: { props: Record<string, unknown> }) => h('button', { class: 'open', ...scope.props }),
        },
    })
    await wrapper.get('button.open').trigger('click')
    await flushPromises()
    return wrapper
}

describe('DeleteProjectDialog', () => {
    it('explains the soft delete before confirming', async () => {
        await openDialog()

        const content = new DOMWrapper(document.body).get('.v-overlay__content')
        expect(content.text()).toContain('Delete project')
        expect(content.text()).toContain('permanently deleted after 30 days')
    })

    it('deletes the project and returns to the project list', async () => {
        const deleteSpy = vi.spyOn(ProjectApi, 'deleteProject').mockResolvedValue(undefined)
        await openDialog()

        await dialogButton('Delete').trigger('click')

        await vi.waitFor(() => {
            expect(push).toHaveBeenCalledWith({ name: RouteNames.PROJECT_LIST })
        })
        expect(deleteSpy).toHaveBeenCalledWith({ path: { projectId: 1 } })
    })

    it('shows the api error and stays on the project when deleting fails', async () => {
        vi.spyOn(ProjectApi, 'deleteProject').mockRejectedValue({ message: 'Forbidden resource' })
        await openDialog()

        await dialogButton('Delete').trigger('click')

        await vi.waitFor(() => {
            expect(new DOMWrapper(document.body).get('.v-overlay__content .v-alert').text()).toContain(
                'Forbidden resource',
            )
        })
        expect(push).not.toHaveBeenCalled()
    })

    it('falls back to a generic message when deleting fails without one', async () => {
        vi.spyOn(ProjectApi, 'deleteProject').mockRejectedValue(new Response(null, { status: 500 }))
        await openDialog()

        await dialogButton('Delete').trigger('click')

        await vi.waitFor(() => {
            expect(new DOMWrapper(document.body).get('.v-overlay__content .v-alert').text()).toContain(
                'The project could not be deleted',
            )
        })
    })

    it('does nothing when aborted', async () => {
        const deleteSpy = vi.spyOn(ProjectApi, 'deleteProject')
        await openDialog()

        await dialogButton('Abort').trigger('click')
        await flushPromises()

        expect(deleteSpy).not.toHaveBeenCalled()
        expect(push).not.toHaveBeenCalled()
    })
})
