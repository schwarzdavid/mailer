import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboundFormApi, ProjectApi } from 'api'
import type { Router } from 'vue-router'
import InboundFormDetailView from '../InboundFormDetailView.vue'
import { findButton, mountInApp, overlayButton, overlayText } from '@/__tests__/support.ts'
import { domain, formDetail, projectDetail, receiver } from '@/__tests__/fixtures.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return {
        ...actual,
        useRoute: () => ({ params: { inboundFormId: '9' }, meta: {} }),
        useRouter: () => ({ push }),
        onBeforeRouteLeave: vi.fn<typeof actual.onBeforeRouteLeave>(),
    }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

const notifications = useNotificationHost()

function mockApis(form = formDetail()) {
    vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(form)
    vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(projectDetail({ domains: [domain()] }))
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockReset()
    notifications.dismiss()
    document.body.innerHTML = ''
})

describe('InboundFormDetailView', () => {
    it('shows the form with breadcrumbs, status, endpoint and every card', async () => {
        mockApis()
        const wrapper = mountInApp(InboundFormDetailView)

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toContain('Contact request'))
        await vi.waitFor(() => expect(wrapper.get('.page-header').text()).toContain('Acme Website'))
        expect(wrapper.get('.page-header').text()).toContain('forms.acme.com')
        expect(wrapper.get('.page-header').text()).toContain('1 receiver')
        expect(wrapper.text()).toContain('/api/public/form/contact-request')
        const titles = wrapper.findAll('h2').map((heading) => heading.text().replace(/\s*\d+$/, ''))
        expect(titles).toEqual(['Endpoint', 'General', 'Fields', 'Security', 'Receivers', 'Delete form'])
    })

    it('summarizes field rules in the fields table', async () => {
        mockApis()
        const wrapper = mountInApp(InboundFormDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Full name'))
        expect(wrapper.text()).toContain('1–100 characters')
        expect(wrapper.text()).toContain('Required')
    })

    it('saves the switch immediately and confirms', async () => {
        mockApis()
        const update = vi.spyOn(InboundFormApi, 'updateInboundForm').mockResolvedValue(formDetail({ isActive: false }))
        const wrapper = mountInApp(InboundFormDetailView)
        await vi.waitFor(() => expect(wrapper.find('input[name="isActive"]').exists()).toBe(true))

        await wrapper.get('input[name="isActive"]').setValue(false)

        await vi.waitFor(() =>
            expect(update).toHaveBeenCalledWith({ path: { inboundFormId: 9 }, body: { isActive: false } }),
        )
        await vi.waitFor(() => expect(notifications.current.value?.text).toBe('Form deactivated'))
    })

    it('removes a field only after the undo window, sending the remaining fields', async () => {
        mockApis()
        const save = vi.spyOn(InboundFormApi, 'updateInboundFormFields').mockResolvedValue([])
        const wrapper = mountInApp(InboundFormDetailView)
        await vi.waitFor(() => expect(wrapper.find('button[aria-label="Remove field email"]').exists()).toBe(true))

        await wrapper.get('button[aria-label="Remove field email"]').trigger('click')

        expect(notifications.current.value?.text).toBe('Field “email” removed')
        expect(save).not.toHaveBeenCalled()
        notifications.dismiss()
        await vi.waitFor(() => expect(save).toHaveBeenCalled())
        expect(save.mock.calls[0]![0].body.fields.map((field) => field.key)).toEqual(['name'])
    })

    it('confirms before removing a receiver that has a template', async () => {
        mockApis()
        const remove = vi.spyOn(InboundFormApi, 'deleteInboundFormReceiver').mockResolvedValue(undefined)
        const wrapper = mountInApp(InboundFormDetailView)
        await vi.waitFor(() =>
            expect(wrapper.find('button[aria-label="Actions for receiver sales@acme.com"]').exists()).toBe(true),
        )

        await wrapper.get('button[aria-label="Actions for receiver sales@acme.com"]').trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Remove receiver…'))
        ;[...document.body.querySelectorAll<HTMLElement>('.v-list-item')]
            .find((item) => item.textContent?.includes('Remove receiver…'))!
            .click()
        await vi.waitFor(() => expect(overlayText()).toContain('Remove receiver sales@acme.com?'))
        overlayButton('Remove receiver').click()

        await vi.waitFor(() =>
            expect(remove).toHaveBeenCalledWith({ path: { inboundFormId: 9, inboundFormReceiverId: 1 } }),
        )
    })

    it('removes a receiver without a template with undo', async () => {
        mockApis(formDetail({ receivers: [receiver({ publishedVersion: null })] }))
        const remove = vi.spyOn(InboundFormApi, 'deleteInboundFormReceiver').mockResolvedValue(undefined)
        const wrapper = mountInApp(InboundFormDetailView)
        await vi.waitFor(() =>
            expect(wrapper.find('button[aria-label="Actions for receiver sales@acme.com"]').exists()).toBe(true),
        )

        await wrapper.get('button[aria-label="Actions for receiver sales@acme.com"]').trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Remove receiver…'))
        ;[...document.body.querySelectorAll<HTMLElement>('.v-list-item')]
            .find((item) => item.textContent?.includes('Remove receiver…'))!
            .click()

        await vi.waitFor(() => expect(notifications.current.value?.text).toBe('Receiver sales@acme.com removed'))
        expect(remove).not.toHaveBeenCalled()
        notifications.dismiss()
        await vi.waitFor(() => expect(remove).toHaveBeenCalled())
    })

    it('deletes the form after confirmation and returns to the project', async () => {
        push.mockResolvedValue(undefined)
        mockApis()
        const remove = vi.spyOn(InboundFormApi, 'deleteInboundForm').mockResolvedValue(undefined)
        const wrapper = mountInApp(InboundFormDetailView)
        await vi.waitFor(() => expect(findButton(wrapper, 'Delete form…')).toBeDefined())

        await findButton(wrapper, 'Delete form…')!.trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Delete form “Contact request”?'))
        overlayButton('Delete form').click()

        await vi.waitFor(() =>
            expect(push).toHaveBeenCalledWith({ name: RouteNames.PROJECT_DETAILS, params: { projectId: 1 } }),
        )
        expect(remove).toHaveBeenCalledWith({ path: { inboundFormId: 9 } })
    })

    it('offers editing and deletion to form managers of the project', async () => {
        mockApis()
        const wrapper = mountInApp(InboundFormDetailView, {}, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
            { action: 'forms.manage', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        await vi.waitFor(() => expect(findButton(wrapper, 'Add field')).toBeDefined())
        const titles = wrapper.findAll('h2').map((heading) => heading.text().replace(/\s*\d+$/, ''))
        expect(titles).toContain('Delete form')
    })

    it('shows values as text and no actions without update rights', async () => {
        mockApis()
        const wrapper = mountInApp(InboundFormDetailView, {}, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toContain('Contact request'))
        expect(wrapper.find('input').exists()).toBe(false)
        expect(findButton(wrapper, 'Add field')).toBeUndefined()
        expect(findButton(wrapper, 'View template')).toBeDefined()
        expect(wrapper.text()).not.toContain('Delete form')
        expect(wrapper.text()).toContain('/api/public/form/contact-request')
    })

    it('shows the not-found state', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockRejectedValue({ statusCode: 404 })
        const wrapper = mountInApp(InboundFormDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("This form doesn't exist"))
    })
})
