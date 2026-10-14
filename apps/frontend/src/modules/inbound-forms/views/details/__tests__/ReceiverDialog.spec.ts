import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive, ref } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import type { InboundFormReceiverCreateDto, InboundFormReceiverDto } from 'api'
import ReceiverDialog from '../partials/ReceiverDialog.vue'
import { mountView } from '@/__tests__/support.ts'

vi.stubGlobal('visualViewport', undefined)
enableAutoUnmount(afterEach)

const receiver: InboundFormReceiverDto = {
    inboundFormReceiverId: 31,
    emailFrom: 'contact@mail.example.com',
    emailReceiver: 'owner@business.com',
    emailReplyTo: '{{email}}',
    isActive: false,
    draftVersion: null,
    publishedVersion: 1,
}

function dialog() {
    return new DOMWrapper(document.body).get('.v-overlay__content')
}

function inputValue(name: string): string {
    return (dialog().get(`input[name="${name}"]`).element as HTMLInputElement).value
}

async function openDialog(props: { receiver: InboundFormReceiverDto | null; domainFqdn: string | null }) {
    const open = ref(false)
    const host = defineComponent({
        setup: () => () =>
            h(ReceiverDialog, { modelValue: open.value, emailFieldKeys: ['email'], saving: false, ...props }),
    })
    const wrapper = mountView(host)
    open.value = true
    await flushPromises()
    return wrapper.getComponent(ReceiverDialog)
}

function mountHost(state: { modelValue: boolean; domainFqdn: string | null }, error: string | null = null) {
    const host = defineComponent({
        setup: () => () =>
            h(ReceiverDialog, {
                modelValue: state.modelValue,
                domainFqdn: state.domainFqdn,
                receiver: null,
                emailFieldKeys: ['email'],
                saving: false,
                error,
            }),
    })
    return mountView(host)
}

function savedReceivers(wrapper: Awaited<ReturnType<typeof openDialog>>): InboundFormReceiverCreateDto[] {
    return (wrapper.emitted<[InboundFormReceiverCreateDto]>('save') ?? []).map(([saved]) => saved)
}

describe('ReceiverDialog', () => {
    it('suggests a noreply sender on the form domain for a new receiver', async () => {
        const wrapper = await openDialog({ receiver: null, domainFqdn: 'mail.example.com' })

        expect(dialog().text()).toContain('Add receiver')
        expect(inputValue('emailFrom')).toBe('noreply@mail.example.com')
        await dialog().get('input[name="emailReceiver"]').setValue('owner@business.com')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(savedReceivers(wrapper)).toEqual([
                {
                    emailFrom: 'noreply@mail.example.com',
                    emailReceiver: 'owner@business.com',
                    emailReplyTo: null,
                    isActive: true,
                },
            ])
        })
    })

    it('suggests the noreply sender once the form domain arrives after opening', async () => {
        const state = reactive({ modelValue: false, domainFqdn: null as string | null })
        mountHost(state)
        state.modelValue = true
        await flushPromises()
        expect(inputValue('emailFrom')).toBe('')

        state.domainFqdn = 'mail.example.com'
        await flushPromises()

        expect(inputValue('emailFrom')).toBe('noreply@mail.example.com')
        expect(dialog().find('.v-input--error input[name="emailFrom"]').exists()).toBe(false)
    })

    it('keeps a typed sender when the form domain arrives later', async () => {
        const state = reactive({ modelValue: false, domainFqdn: null as string | null })
        mountHost(state)
        state.modelValue = true
        await flushPromises()
        await dialog().get('input[name="emailFrom"]').setValue('team@mail.example.com')

        state.domainFqdn = 'mail.example.com'
        await flushPromises()

        expect(inputValue('emailFrom')).toBe('team@mail.example.com')
    })

    it('shows the error passed by the parent', async () => {
        const state = reactive({ modelValue: false, domainFqdn: null as string | null })
        mountHost(state, 'Sender domain invalid')
        state.modelValue = true
        await flushPromises()

        expect(dialog().get('.v-alert').text()).toContain('Sender domain invalid')
    })

    it('accepts a form field placeholder as recipient', async () => {
        const wrapper = await openDialog({ receiver: null, domainFqdn: 'mail.example.com' })

        await dialog().get('input[name="emailReceiver"]').setValue('{{email}}')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(savedReceivers(wrapper)[0]?.emailReceiver).toBe('{{email}}')
        })
    })

    it('prefills an existing receiver and keeps its values', async () => {
        const wrapper = await openDialog({ receiver, domainFqdn: 'mail.example.com' })

        expect(dialog().text()).toContain('Edit')
        expect(inputValue('emailFrom')).toBe('contact@mail.example.com')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(savedReceivers(wrapper)).toEqual([
                {
                    emailFrom: 'contact@mail.example.com',
                    emailReceiver: 'owner@business.com',
                    emailReplyTo: '{{email}}',
                    isActive: false,
                },
            ])
        })
    })

    it('requires a valid sender address and a recipient', async () => {
        const wrapper = await openDialog({ receiver: null, domainFqdn: null })

        expect(inputValue('emailFrom')).toBe('')
        await dialog().get('input[name="emailFrom"]').setValue('not-an-email')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().find('.v-input--error input[name="emailFrom"]').exists()).toBe(true)
            expect(dialog().find('.v-input--error input[name="emailReceiver"]').exists()).toBe(true)
        })
        expect(wrapper.emitted('save')).toBeUndefined()
    })
})
