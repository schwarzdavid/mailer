import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { InboundFormApi, type InboundFormDetailDto, type InboundFormTemplateDto } from 'api'
import type { Router } from 'vue-router'
import InboundFormTemplateView from '../InboundFormTemplateView.vue'
import { mountView } from '@/__tests__/support.ts'

vi.stubGlobal('visualViewport', undefined)

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return {
        ...actual,
        useRoute: () => ({ params: { inboundFormId: '1', inboundFormReceiverId: '31' } }),
        useRouter: () => ({ push }),
    }
})

const { insertText } = vi.hoisted(() => ({ insertText: vi.fn<(text: string) => void>() }))

vi.mock('@/modules/inbound-forms/views/template/partials/MonacoEditor.vue', () => ({
    default: {
        name: 'MonacoEditor',
        props: ['modelValue', 'fieldKeys'],
        emits: ['update:modelValue'],
        methods: {
            insertText,
        },
        template:
            '<textarea class="monaco-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    },
}))

const detail: InboundFormDetailDto = {
    inboundFormId: 1,
    projectId: 5,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    fields: [
        {
            inboundFormFieldId: 21,
            key: 'firstName',
            label: 'First name',
            type: 'text',
            defaultValue: null,
            validation: null,
        },
        {
            inboundFormFieldId: 22,
            key: 'email',
            label: 'Email',
            type: 'email',
            defaultValue: null,
            validation: { required: true },
        },
    ],
    security: [],
    receivers: [
        {
            inboundFormReceiverId: 31,
            emailFrom: 'noreply@mail.example.com',
            emailReceiver: 'owner@business.com',
            emailReplyTo: null,
            isActive: true,
            draftVersion: 2,
            publishedVersion: 1,
        },
    ],
}

const draft: InboundFormTemplateDto = {
    inboundFormTemplateId: 42,
    inboundFormReceiverId: 31,
    subject: 'Message from {{firstName}}',
    template: '<p>{{firstName}} wrote in</p>',
    status: 'draft',
    version: 2,
    updatedAt: new Date('2026-01-03T00:00:00.000Z'),
}

const published: InboundFormTemplateDto = {
    ...draft,
    inboundFormTemplateId: 41,
    status: 'published',
    version: 1,
    subject: 'Old subject',
    template: '<p>Old</p>',
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
    insertText.mockClear()
})

describe('InboundFormTemplateView', () => {
    it('loads the draft into subject and editor and lists field chips', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft, published])
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        expect((wrapper.get('input[name="subject"]').element as HTMLInputElement).value).toBe(
            'Message from {{firstName}}',
        )
        expect((wrapper.get('.monaco-stub').element as HTMLTextAreaElement).value).toBe('<p>{{firstName}} wrote in</p>')
        expect(wrapper.text()).toContain('firstName')
        expect(wrapper.text()).toContain('email')
    })

    it('saves the draft through the api', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft, published])
        const saveSpy = vi.spyOn(InboundFormApi, 'saveInboundFormTemplateDraft').mockResolvedValue(draft)
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        await wrapper.get('button[data-testid="save-draft"]').trigger('click')

        await vi.waitFor(() => {
            expect(saveSpy).toHaveBeenCalledWith({
                path: { inboundFormId: 1, inboundFormReceiverId: 31 },
                body: { subject: 'Message from {{firstName}}', template: '<p>{{firstName}} wrote in</p>' },
            })
        })
    })

    it('inserts a field placeholder into the editor when its chip is clicked', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft, published])
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        await wrapper.get('[role="button"][aria-label="Insert field firstName"]').trigger('click')

        expect(insertText).toHaveBeenCalledWith('{{firstName}}')
    })

    it('exposes field chips as focusable buttons that insert on Enter and Space', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft, published])
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        const chip = wrapper.get('[aria-label="Insert field email"]')
        expect(chip.attributes('role')).toBe('button')
        expect(chip.attributes('tabindex')).toBe('0')
        await chip.trigger('keydown', { key: 'Enter' })
        await chip.trigger('keydown', { key: ' ' })

        expect(insertText.mock.calls).toEqual([['{{email}}'], ['{{email}}']])
    })

    it('shows a generic error when saving fails without a message', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft, published])
        vi.spyOn(InboundFormApi, 'saveInboundFormTemplateDraft').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        await wrapper.get('button[data-testid="save-draft"]').trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.text()).toContain('Saving failed: Unknown error')
        })
    })

    it('publishes after saving the draft', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft, published])
        const saveSpy = vi.spyOn(InboundFormApi, 'saveInboundFormTemplateDraft').mockResolvedValue(draft)
        const publishSpy = vi.spyOn(InboundFormApi, 'publishInboundFormTemplate').mockResolvedValue(published)
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        await wrapper.get('button[data-testid="publish"]').trigger('click')

        await vi.waitFor(
            () => {
                expect(saveSpy).toHaveBeenCalledWith({
                    path: { inboundFormId: 1, inboundFormReceiverId: 31 },
                    body: { subject: 'Message from {{firstName}}', template: '<p>{{firstName}} wrote in</p>' },
                })
                expect(publishSpy).toHaveBeenCalledWith({
                    path: { inboundFormId: 1, inboundFormReceiverId: 31 },
                })
            },
            { timeout: 3000 },
        )
    })

    it('shows an error alert when saving fails', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft, published])
        vi.spyOn(InboundFormApi, 'saveInboundFormTemplateDraft').mockRejectedValue(new Error('boom'))
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        await wrapper.get('button[data-testid="save-draft"]').trigger('click')

        await vi.waitFor(
            () => {
                expect(wrapper.text()).toContain('Saving failed: boom')
            },
            { timeout: 3000 },
        )
    })

    it('shows the receiver routing in the header', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft, published])
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('h1').exists()).toBe(true)
        })

        expect(wrapper.get('h1').text()).toBe('Email template')
        expect(wrapper.text()).toContain('noreply@mail.example.com → owner@business.com')
    })

    it('renders nothing for a receiver that does not belong to the form', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue({ ...detail, receivers: [] })
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([])
        const wrapper = mountView(InboundFormTemplateView)

        await flushPromises()

        expect(wrapper.find('h1').exists()).toBe(false)
        expect(wrapper.find('.monaco-stub').exists()).toBe(false)
    })

    it('starts from the published version when there is no draft', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([published])
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        expect((wrapper.get('input[name="subject"]').element as HTMLInputElement).value).toBe('Old subject')
        expect((wrapper.get('.monaco-stub').element as HTMLTextAreaElement).value).toBe('<p>Old</p>')
    })

    it('starts empty for a receiver without any template', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([])
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        expect((wrapper.get('input[name="subject"]').element as HTMLInputElement).value).toBe('')
        expect(wrapper.text()).not.toContain('Versions')
    })

    it('loads an older version from the versions menu into the editor', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft, published])
        const wrapper = mountView(InboundFormTemplateView, { attachTo: document.body })

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        const versionsButton = wrapper.findAll('button').find((button) => button.text() === 'Versions')
        await versionsButton!.trigger('click')
        await flushPromises()
        const menuEntry = new DOMWrapper(document.body)
            .findAll('.v-list-item')
            .find((item) => item.text() === 'v1 (Published)')
        expect(menuEntry).toBeDefined()
        await menuEntry!.trigger('click')

        expect((wrapper.get('input[name="subject"]').element as HTMLInputElement).value).toBe('Old subject')
        expect((wrapper.get('.monaco-stub').element as HTMLTextAreaElement).value).toBe('<p>Old</p>')
        wrapper.unmount()
    })

    it('saves the edited subject and template rather than the loaded ones', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft])
        const saveSpy = vi.spyOn(InboundFormApi, 'saveInboundFormTemplateDraft').mockResolvedValue(draft)
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        await wrapper.get('input[name="subject"]').setValue('New subject')
        await wrapper.get('.monaco-stub').setValue('<p>New body</p>')
        await wrapper.get('button[data-testid="save-draft"]').trigger('click')

        await vi.waitFor(() => {
            expect(saveSpy).toHaveBeenCalledWith({
                path: { inboundFormId: 1, inboundFormReceiverId: 31 },
                body: { subject: 'New subject', template: '<p>New body</p>' },
            })
        })
    })

    it('does not publish when saving the draft fails', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft, published])
        vi.spyOn(InboundFormApi, 'saveInboundFormTemplateDraft').mockRejectedValue(new Error('invalid template'))
        const publishSpy = vi.spyOn(InboundFormApi, 'publishInboundFormTemplate')
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        await wrapper.get('button[data-testid="publish"]').trigger('click')

        await vi.waitFor(
            () => {
                expect(wrapper.text()).toContain('Saving failed: invalid template')
            },
            { timeout: 3000 },
        )
        expect(publishSpy).not.toHaveBeenCalled()
    })

    it('shows an error alert when publishing fails', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForm').mockResolvedValue(detail)
        vi.spyOn(InboundFormApi, 'getInboundFormTemplates').mockResolvedValue([draft, published])
        vi.spyOn(InboundFormApi, 'saveInboundFormTemplateDraft').mockResolvedValue(draft)
        vi.spyOn(InboundFormApi, 'publishInboundFormTemplate').mockRejectedValue(new Error('publish denied'))
        const wrapper = mountView(InboundFormTemplateView)

        await vi.waitFor(() => {
            expect(wrapper.find('.monaco-stub').exists()).toBe(true)
        })
        await flushPromises()

        await wrapper.get('button[data-testid="publish"]').trigger('click')

        await vi.waitFor(
            () => {
                expect(wrapper.text()).toContain('Saving failed: publish denied')
            },
            { timeout: 3000 },
        )
    })
})
