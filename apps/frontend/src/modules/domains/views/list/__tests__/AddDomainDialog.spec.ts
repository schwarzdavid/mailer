import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { VApp, VBtn } from 'vuetify/components'
import { DomainApi, type DomainDnsRecordDto, type DomainDto } from 'api'
import type { Router } from 'vue-router'
import AddDomainDialog from '../partials/AddDomainDialog.vue'
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

vi.stubGlobal('visualViewport', null)

const record: DomainDnsRecordDto = {
    current: null,
    host: 'news.example.org',
    status: 'invalid',
    type: 'txt',
    use: 'spf',
    value: 'v=spf1 include:sending-domain.org -all',
}

const created: DomainDto = {
    domainId: 6,
    fqdn: 'news.example.org',
    rootDomain: 'example.org',
    dns: { spf: record, dkim: record, dmarc: record },
    lastCheckedAt: null,
}

const DialogHost = defineComponent({
    setup: () => () =>
        h(VApp, () =>
            h(AddDomainDialog, null, {
                default: ({ props }: { props: Record<string, unknown> }) =>
                    h(VBtn, { ...props, class: 'open-dialog' }, () => 'Add'),
            }),
        ),
})

async function openDialog() {
    const wrapper = mountView(DialogHost)
    await wrapper.get('.open-dialog').trigger('click')
    await vi.waitFor(() => expect(document.body.querySelector('input[name="fqdn"]')).not.toBeNull())
    return wrapper
}

async function enterFqdn(fqdn: string) {
    const input = document.body.querySelector<HTMLInputElement>('input[name="fqdn"]')!
    input.value = fqdn
    input.dispatchEvent(new Event('input'))
    await flushPromises()
}

async function submit() {
    document.body.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()
}

function dialogText() {
    return document.body.querySelector('.v-overlay-container')?.textContent ?? ''
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
    document.body.innerHTML = ''
})

describe('AddDomainDialog', () => {
    it('opens from the activator slot', async () => {
        const wrapper = await openDialog()

        expect(dialogText()).toContain('New Domain')
        expect(dialogText()).toContain('Enter your domain name')
        expect(dialogText()).not.toContain('It is recommended to use a subdomain')
        wrapper.unmount()
    })

    it('does not create a domain for an empty name', async () => {
        const create = vi.spyOn(DomainApi, 'createDomain')
        const wrapper = await openDialog()

        await submit()

        await vi.waitFor(() => expect(document.body.querySelector('.v-input--error')).not.toBeNull())
        expect(create).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('rejects a name without a public suffix', async () => {
        const create = vi.spyOn(DomainApi, 'createDomain')
        const wrapper = await openDialog()

        await enterFqdn('intranet.localdomain')
        await submit()

        await vi.waitFor(() => expect(dialogText()).toContain('Invalid domain name'))
        expect(create).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('recommends a subdomain when an apex domain is entered', async () => {
        const wrapper = await openDialog()

        await enterFqdn('example.org')

        await vi.waitFor(() =>
            expect(dialogText()).toContain('It is recommended to use a subdomain (e.g. mail.example.org)'),
        )
        wrapper.unmount()
    })

    it.each(['example', 'intranet.localdomain'])(
        'does not recommend a subdomain for the incomplete name %s',
        async (name) => {
            const wrapper = await openDialog()

            await enterFqdn(name)

            expect(dialogText()).not.toContain('It is recommended to use a subdomain')
            wrapper.unmount()
        },
    )

    it('hides the recommendation again once the name is cleared', async () => {
        const wrapper = await openDialog()

        await enterFqdn('example.org')
        await vi.waitFor(() => expect(dialogText()).toContain('It is recommended to use a subdomain'))
        await enterFqdn('')

        await vi.waitFor(() => expect(dialogText()).not.toContain('It is recommended to use a subdomain'))
        wrapper.unmount()
    })

    it('shows the API error and stays open when creating fails', async () => {
        vi.spyOn(DomainApi, 'createDomain').mockRejectedValue({ message: 'Domain already exists', statusCode: 409 })
        const wrapper = await openDialog()

        await enterFqdn('news.example.org')
        await submit()

        await vi.waitFor(() => expect(dialogText()).toContain('Domain already exists'))
        expect(push).not.toHaveBeenCalled()
        expect(document.body.querySelector('input[name="fqdn"]')).not.toBeNull()
        wrapper.unmount()
    })

    it('falls back to a generic error when creating fails without a message', async () => {
        vi.spyOn(DomainApi, 'createDomain').mockRejectedValue(null)
        const wrapper = await openDialog()

        await enterFqdn('news.example.org')
        await submit()

        await vi.waitFor(() => expect(dialogText()).toContain('The domain could not be created'))
        expect(push).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('does not warn about a subdomain', async () => {
        const wrapper = await openDialog()

        await enterFqdn('news.example.org')

        await vi.waitFor(() => expect(dialogText()).not.toContain('It is recommended to use a subdomain'))
        wrapper.unmount()
    })

    it('creates the domain and opens its detail page', async () => {
        const create = vi.spyOn(DomainApi, 'createDomain').mockResolvedValue(created)
        const wrapper = await openDialog()

        await enterFqdn('news.example.org')
        await submit()

        await vi.waitFor(() => {
            expect(push).toHaveBeenCalledWith({ name: RouteNames.DOMAIN_DETAILS, params: { domainId: 6 } })
        })
        expect(create).toHaveBeenCalledWith({ body: { fqdn: 'news.example.org' } })
        wrapper.unmount()
    })
})
