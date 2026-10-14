import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import {
    DomainApi,
    InboundFormApi,
    type DomainDnsRecordDto,
    type DomainDto,
    type InboundFormDetailDto,
    type InboundFormReceiverDto,
} from 'api'
import ReceiversCard from '../partials/ReceiversCard.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', undefined)
enableAutoUnmount(afterEach)

const receivers: InboundFormReceiverDto[] = [
    {
        inboundFormReceiverId: 31,
        emailFrom: 'noreply@mail.example.com',
        emailReceiver: 'owner@business.com',
        emailReplyTo: '{{email}}',
        isActive: true,
        draftVersion: 3,
        publishedVersion: 2,
    },
    {
        inboundFormReceiverId: 32,
        emailFrom: 'noreply@mail.example.com',
        emailReceiver: 'sales@business.com',
        emailReplyTo: null,
        isActive: false,
        draftVersion: null,
        publishedVersion: 2,
    },
    {
        inboundFormReceiverId: 33,
        emailFrom: 'noreply@mail.example.com',
        emailReceiver: 'archive@business.com',
        emailReplyTo: null,
        isActive: true,
        draftVersion: null,
        publishedVersion: null,
    },
]

const form: InboundFormDetailDto = {
    inboundFormId: 1,
    projectId: 5,
    domainId: 3,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    fields: [],
    security: [],
    receivers,
}

const record: DomainDnsRecordDto = { current: null, host: '', status: 'valid', type: 'txt', use: 'spf', value: '' }

const domain: DomainDto = {
    domainId: 3,
    fqdn: 'mail.example.com',
    rootDomain: 'example.com',
    dns: { spf: record, dkim: { ...record, use: 'dkim' }, dmarc: { ...record, use: 'dmarc' } },
    lastCheckedAt: null,
}

afterEach(() => {
    vi.restoreAllMocks()
})

function dialog() {
    return new DOMWrapper(document.body).get('.v-overlay__content')
}

function itemFor(wrapper: ReturnType<typeof mountView>, receiverAddress: string) {
    return wrapper.findAll('.v-list-item').find((item) => item.text().includes(receiverAddress))!
}

function iconButton(item: ReturnType<typeof itemFor>, icon: string) {
    return item.findAll('button').find((button) => button.find(`.${icon}`).exists())!
}

describe('ReceiversCard', () => {
    it('shows the empty hint without receivers', () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([domain])
        const wrapper = mountView(ReceiversCard, { props: { form: { ...form, receivers: [] } } })

        expect(wrapper.text()).toContain('No receivers configured')
    })

    it('summarises routing, status and template state per receiver', () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([domain])
        const wrapper = mountView(ReceiversCard, { props: { form } })

        const drafted = itemFor(wrapper, 'owner@business.com')
        expect(drafted.text()).toContain('noreply@mail.example.com → owner@business.com')
        expect(drafted.text()).toContain('Reply-To: {{email}}')
        expect(drafted.text()).toContain('Draft v3')
        expect(drafted.text()).toContain('Active')

        const published = itemFor(wrapper, 'sales@business.com')
        expect(published.text()).toContain('Published v2')
        expect(published.text()).toContain('Inactive')
        expect(published.text()).not.toContain('Reply-To')

        expect(itemFor(wrapper, 'archive@business.com').text()).toContain('No template')
    })

    it('deletes the clicked receiver', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([domain])
        const deleteSpy = vi.spyOn(InboundFormApi, 'deleteInboundFormReceiver').mockResolvedValue(undefined)
        const wrapper = mountView(ReceiversCard, { props: { form } })

        await iconButton(itemFor(wrapper, 'sales@business.com'), 'mdi-delete').trigger('click')

        await vi.waitFor(() => {
            expect(deleteSpy).toHaveBeenCalledWith({ path: { inboundFormId: 1, inboundFormReceiverId: 32 } })
        })
    })

    it('updates the edited receiver instead of creating a new one', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([domain])
        const createSpy = vi.spyOn(InboundFormApi, 'createInboundFormReceiver')
        const updateSpy = vi.spyOn(InboundFormApi, 'updateInboundFormReceiver').mockResolvedValue(receivers[1])
        const wrapper = mountView(ReceiversCard, { props: { form } })

        await iconButton(itemFor(wrapper, 'sales@business.com'), 'mdi-pencil').trigger('click')
        await flushPromises()
        await dialog().get('input[name="emailReceiver"]').setValue('team@business.com')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith({
                path: { inboundFormId: 1, inboundFormReceiverId: 32 },
                body: {
                    emailFrom: 'noreply@mail.example.com',
                    emailReceiver: 'team@business.com',
                    emailReplyTo: null,
                    isActive: false,
                },
            })
        })
        expect(createSpy).not.toHaveBeenCalled()
    })

    it('creates a receiver with a sender on the form domain', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([domain])
        const createSpy = vi.spyOn(InboundFormApi, 'createInboundFormReceiver').mockResolvedValue(receivers[0])
        const wrapper = mountView(ReceiversCard, { props: { form } })
        await flushPromises()

        const add = wrapper.findAll('button').find((button) => button.text() === 'Add receiver')
        await add!.trigger('click')
        await flushPromises()
        await dialog().get('input[name="emailReceiver"]').setValue('new@business.com')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(createSpy).toHaveBeenCalledWith({
                path: { inboundFormId: 1 },
                body: {
                    emailFrom: 'noreply@mail.example.com',
                    emailReceiver: 'new@business.com',
                    emailReplyTo: null,
                    isActive: true,
                },
            })
        })
    })

    it('shows the api error when deleting a receiver fails', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([domain])
        vi.spyOn(InboundFormApi, 'deleteInboundFormReceiver').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = mountView(ReceiversCard, { props: { form } })

        await iconButton(itemFor(wrapper, 'sales@business.com'), 'mdi-delete').trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('The receiver could not be removed')
        })
    })

    it('keeps the dialog open with the api error when saving a receiver fails', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([domain])
        vi.spyOn(InboundFormApi, 'createInboundFormReceiver').mockRejectedValue({ message: 'Sender domain invalid' })
        const wrapper = mountView(ReceiversCard, { props: { form } })
        await flushPromises()

        const add = wrapper.findAll('button').find((button) => button.text() === 'Add receiver')
        await add!.trigger('click')
        await flushPromises()
        await dialog().get('input[name="emailReceiver"]').setValue('new@business.com')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().get('.v-alert').text()).toContain('Sender domain invalid')
        })
    })
})
