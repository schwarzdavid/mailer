import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboundFormApi, ProjectApi } from 'api'
import InboundFormTemplateView from '../InboundFormTemplateView.vue'
import { findButton, mountInApp, overlayButton, overlayText } from '@/__tests__/support.ts'
import { formDetail, projectDetail, receiver, template } from '@/__tests__/fixtures.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'

vi.stubGlobal('visualViewport', null)

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return {
        ...actual,
        useRoute: () => ({ params: { inboundFormId: '9', inboundFormReceiverId: '1' }, meta: {} }),
        onBeforeRouteLeave: vi.fn<typeof actual.onBeforeRouteLeave>(),
    }
})

const { insertText } = vi.hoisted(() => ({ insertText: vi.fn<(text: string) => void>() }))

vi.mock('@/modules/inbound-forms/views/template/partials/MonacoEditor.vue', () => ({
    default: {
        name: 'MonacoEditor',
        props: ['modelValue', 'fieldKeys', 'readOnly', 'errorLine'],
        emits: ['update:modelValue', 'save', 'cursor'],
        methods: { insertText },
        template:
            '<textarea class="monaco-stub" :value="modelValue" :readonly="readOnly" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    },
}))

const notifications = useNotificationHost()

const published = template({
    inboundFormTemplateId: 60,
    status: 'published',
    version: 1,
    subject: 'Live',
    template: '<p>live</p>',
})
const draft = template()

function mockApis(versions = [draft, published], form = formDetail({ receivers: [receiver({ draftVersion: 2 })] })) {
    vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(form)
    vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue(versions)
    vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(projectDetail())
}

function editor(wrapper: ReturnType<typeof mountInApp>) {
    return wrapper.get<HTMLTextAreaElement>('.monaco-stub')
}

afterEach(() => {
    vi.restoreAllMocks()
    insertText.mockReset()
    notifications.dismiss()
    document.body.innerHTML = ''
    localStorage.removeItem('template-editor-layout')
})

describe('InboundFormTemplateView', () => {
    it('loads the draft and shows its version, route and the live version', async () => {
        mockApis()
        const wrapper = mountInApp(InboundFormTemplateView)

        await vi.waitFor(() => expect(editor(wrapper).element.value).toBe('<p>{{name}}</p>'))
        expect((wrapper.get('input[name="subject"]').element as HTMLInputElement).value).toBe('New contact request')
        expect(wrapper.get('.page-header').text()).toContain('Draft v2')
        expect(wrapper.get('.page-header').text()).toContain('forms@acme.com → sales@acme.com')
        expect(wrapper.get('.page-header').text()).toContain('Live: v1')
        expect(wrapper.get('.page-header').text()).toContain('Contact request')
    })

    it('marks unsaved changes and saves a draft', async () => {
        mockApis()
        const save = vi
            .spyOn(InboundFormApi, 'saveInboundFormTemplateDraft')
            .mockResolvedValue(template({ template: '<p>new</p>' }))
        const wrapper = mountInApp(InboundFormTemplateView)
        await vi.waitFor(() => expect(wrapper.find('.monaco-stub').exists()).toBe(true))

        await editor(wrapper).setValue('<p>new</p>')
        expect(wrapper.text()).toContain('Unsaved changes')
        await wrapper.get('[data-testid="save-draft"]').trigger('click')

        await vi.waitFor(() =>
            expect(save).toHaveBeenCalledWith({
                path: { inboundFormId: 9, inboundFormReceiverId: 1 },
                body: { subject: 'New contact request', template: '<p>new</p>' },
            }),
        )
        await vi.waitFor(() => expect(wrapper.text()).not.toContain('Unsaved changes'))
    })

    it('inserts a field placeholder', async () => {
        mockApis()
        const wrapper = mountInApp(InboundFormTemplateView)
        await vi.waitFor(() => expect(wrapper.find('button[aria-label="Insert field email"]').exists()).toBe(true))

        await wrapper.get('button[aria-label="Insert field email"]').trigger('click')

        expect(insertText).toHaveBeenCalledWith('{{email}}')
    })

    it('publishes after confirming and saving the draft', async () => {
        mockApis()
        const save = vi.spyOn(InboundFormApi, 'saveInboundFormTemplateDraft').mockResolvedValue(draft)
        const publish = vi
            .spyOn(InboundFormApi, 'publishInboundFormTemplate')
            .mockResolvedValue(template({ status: 'published', version: 2 }))
        const wrapper = mountInApp(InboundFormTemplateView)
        await vi.waitFor(() => expect(wrapper.find('[data-testid="publish"]').exists()).toBe(true))

        await wrapper.get('[data-testid="publish"]').trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Publish draft v2?'))
        overlayButton('Publish').click()

        await vi.waitFor(() => expect(publish).toHaveBeenCalled())
        expect(save).toHaveBeenCalled()
        await vi.waitFor(() => expect(notifications.current.value?.text).toBe('Published as v2'))
    })

    it('keeps the content and offers a retry when saving fails', async () => {
        mockApis()
        vi.spyOn(InboundFormApi, 'saveInboundFormTemplateDraft').mockRejectedValue({ message: 'Connection lost' })
        const wrapper = mountInApp(InboundFormTemplateView)
        await vi.waitFor(() => expect(wrapper.find('.monaco-stub').exists()).toBe(true))

        await editor(wrapper).setValue('<p>keep me</p>')
        await wrapper.get('[data-testid="save-draft"]').trigger('click')

        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't save the draft"))
        expect(wrapper.text()).toContain('Connection lost')
        expect(editor(wrapper).element.value).toBe('<p>keep me</p>')
    })

    it('offers a field layout when there is no template yet', async () => {
        mockApis([], formDetail({ receivers: [receiver({ publishedVersion: null })] }))
        const wrapper = mountInApp(InboundFormTemplateView)
        await vi.waitFor(() => expect(wrapper.text()).toContain('No template yet'))

        await findButton(wrapper, 'Use field layout')!.trigger('click')

        await vi.waitFor(() => expect(editor(wrapper).element.value).toContain('{{email}}'))
        expect(editor(wrapper).element.value).toContain('Full name')
    })

    it('loads an older version from the versions menu as unsaved changes', async () => {
        mockApis()
        const wrapper = mountInApp(InboundFormTemplateView)
        await vi.waitFor(() => expect(findButton(wrapper, 'Versions')).toBeDefined())

        await findButton(wrapper, 'Versions')!.trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Versions of this template'))
        ;[...document.body.querySelectorAll<HTMLButtonElement>('.versions-menu__item')]
            .find((item) => item.textContent?.includes('Published v1'))!
            .click()

        await vi.waitFor(() => expect(editor(wrapper).element.value).toBe('<p>live</p>'))
        expect(wrapper.text()).toContain('Unsaved changes')
    })

    it('opens read-only without update rights', async () => {
        mockApis()
        const wrapper = mountInApp(InboundFormTemplateView, {}, [
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [1] } } },
        ])

        await vi.waitFor(() => expect(wrapper.find('.monaco-stub').exists()).toBe(true))
        expect(editor(wrapper).attributes('readonly')).toBeDefined()
        expect(wrapper.find('[data-testid="save-draft"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="publish"]').exists()).toBe(false)
    })

    it('explains a receiver that does not belong to the form', async () => {
        mockApis([], formDetail({ receivers: [] }))
        const wrapper = mountInApp(InboundFormTemplateView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("This receiver doesn't exist"))
    })

    it('switches between editor, split and preview and remembers the choice', async () => {
        mockApis()
        const wrapper = mountInApp(InboundFormTemplateView)
        await vi.waitFor(() => expect(wrapper.find('.monaco-stub').exists()).toBe(true))
        const panes = () =>
            wrapper.findAll('.template-pane').map((pane) => !(pane.attributes('style') ?? '').includes('display: none'))

        expect(panes()).toEqual([true, true])

        await wrapper
            .findAll('.template-view__layout button')
            .find((button) => button.text() === 'Preview')!
            .trigger('click')
        await vi.waitFor(() => expect(panes()).toEqual([false, true]))

        await wrapper
            .findAll('.template-view__layout button')
            .find((button) => button.text() === 'Editor')!
            .trigger('click')
        await vi.waitFor(() => expect(panes()).toEqual([true, false]))
        expect(localStorage.getItem('template-editor-layout')).toBe('editor')
    })
})
