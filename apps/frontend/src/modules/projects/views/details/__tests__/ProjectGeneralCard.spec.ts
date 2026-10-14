import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectApi } from 'api'
import ProjectGeneralCard from '../partials/ProjectGeneralCard.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { projectDetail } from '@/__tests__/fixtures.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, onBeforeRouteLeave: vi.fn<typeof actual.onBeforeRouteLeave>() }
})

vi.stubGlobal('visualViewport', null)

const notifications = useNotificationHost()

afterEach(() => {
    vi.restoreAllMocks()
    notifications.dismiss()
    document.body.innerHTML = ''
})

describe('ProjectGeneralCard', () => {
    it('saves the project name and confirms', async () => {
        const updateSpy = vi.spyOn(ProjectApi, 'updateProject').mockResolvedValue(projectDetail({ name: 'Acme Shop' }))
        const wrapper = mountInApp(ProjectGeneralCard, { project: projectDetail(), canUpdate: true })

        await wrapper.get('input[name="name"]').setValue('Acme Shop')
        expect(wrapper.text()).toContain('Unsaved changes')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() =>
            expect(updateSpy).toHaveBeenCalledWith({ path: { projectId: 1 }, body: { name: 'Acme Shop' } }),
        )
        await vi.waitFor(() => expect(notifications.current.value?.text).toBe('Project saved'))
    })

    it('discards unsaved edits', async () => {
        const wrapper = mountInApp(ProjectGeneralCard, { project: projectDetail(), canUpdate: true })

        await wrapper.get('input[name="name"]').setValue('Something else')
        await findButton(wrapper, 'Discard')!.trigger('click')

        await vi.waitFor(() =>
            expect((wrapper.get('input[name="name"]').element as HTMLInputElement).value).toBe('Acme Website'),
        )
        expect(wrapper.text()).not.toContain('Unsaved changes')
    })

    it('keeps the input and shows the error when saving fails', async () => {
        vi.spyOn(ProjectApi, 'updateProject').mockRejectedValue({ message: 'Name already taken' })
        const wrapper = mountInApp(ProjectGeneralCard, { project: projectDetail(), canUpdate: true })

        await wrapper.get('input[name="name"]').setValue('Acme Shop')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => expect(wrapper.text()).toContain('Name already taken'))
        expect((wrapper.get('input[name="name"]').element as HTMLInputElement).value).toBe('Acme Shop')
    })

    it('shows the name as text without update rights', () => {
        const wrapper = mountInApp(ProjectGeneralCard, { project: projectDetail(), canUpdate: false })

        expect(wrapper.find('input').exists()).toBe(false)
        expect(wrapper.text()).toContain('Acme Website')
        expect(findButton(wrapper, 'Save')).toBeUndefined()
    })
})
