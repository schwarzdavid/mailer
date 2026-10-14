import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { VApp } from 'vuetify/components'
import { DomainApi, type DomainDnsRecordDto, type DomainDto } from 'api'
import type { Router } from 'vue-router'
import DomainListView from '../DomainListView.vue'
import DomainListEntry from '../partials/DomainListEntry.vue'
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

const valid: DomainDnsRecordDto = {
    current: 'v=spf1 include:sending-domain.org -all',
    host: 'mail.example.org',
    status: 'valid',
    type: 'txt',
    use: 'spf',
    value: 'v=spf1 include:sending-domain.org -all',
}

const invalid: DomainDnsRecordDto = { ...valid, current: null, status: 'invalid' }

const verified: DomainDto = {
    domainId: 5,
    fqdn: 'mail.example.org',
    rootDomain: 'example.org',
    dns: { spf: valid, dkim: valid, dmarc: valid },
    lastCheckedAt: null,
}

const pending: DomainDto = {
    domainId: 6,
    fqdn: 'news.example.net',
    rootDomain: 'example.net',
    dns: { spf: valid, dkim: invalid, dmarc: valid },
    lastCheckedAt: null,
}

const ListHost = defineComponent({
    setup: () => () => h(VApp, () => h(DomainListView)),
})

function entryFor(wrapper: ReturnType<typeof mountView>, fqdn: string) {
    return wrapper.findAll('.v-card').find((card) => card.text().includes(fqdn))!
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
    document.body.innerHTML = ''
})

describe('DomainListView', () => {
    it('shows skeletons while the domains load', () => {
        vi.spyOn(DomainApi, 'getDomains').mockReturnValue(new Promise(() => {}))
        const wrapper = mountView(ListHost)

        expect(wrapper.get('h1').text()).toBe('Domains')
        expect(wrapper.findAll('.v-skeleton-loader')).toHaveLength(3)
        wrapper.unmount()
    })

    it('lists every domain with its verification state', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([verified, pending])
        const wrapper = mountView(ListHost)

        await vi.waitFor(() => expect(wrapper.text()).toContain('news.example.net'))
        expect(entryFor(wrapper, 'mail.example.org').text()).toContain('Valid')
        expect(entryFor(wrapper, 'news.example.net').text()).toContain('Invalid')
        wrapper.unmount()
    })

    it('opens the detail page of a clicked domain', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([verified, pending])
        const wrapper = mountView(ListHost)

        await vi.waitFor(() => expect(wrapper.text()).toContain('news.example.net'))
        await entryFor(wrapper, 'news.example.net').trigger('click')

        expect(push).toHaveBeenCalledWith({ name: RouteNames.DOMAIN_DETAILS, params: { domainId: 6 } })
        wrapper.unmount()
    })

    it('creates a domain from the add dialog', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([verified])
        const create = vi.spyOn(DomainApi, 'createDomain').mockResolvedValue(pending)
        const wrapper = mountView(ListHost)
        await vi.waitFor(() => expect(wrapper.text()).toContain('mail.example.org'))

        const addButton = wrapper.findAll('button').find((button) => button.text() === 'Add')
        await addButton!.trigger('click')
        await vi.waitFor(() => expect(document.body.querySelector('input[name="fqdn"]')).not.toBeNull())
        const input = document.body.querySelector<HTMLInputElement>('input[name="fqdn"]')!
        input.value = 'news.example.net'
        input.dispatchEvent(new Event('input'))
        await flushPromises()
        document.body.querySelector('form')!.dispatchEvent(new Event('submit'))

        await vi.waitFor(() => {
            expect(push).toHaveBeenCalledWith({ name: RouteNames.DOMAIN_DETAILS, params: { domainId: 6 } })
        })
        expect(create).toHaveBeenCalledWith({ body: { fqdn: 'news.example.net' } })
        await vi.waitFor(() => {
            expect(wrapper.findAllComponents(DomainListEntry).map((entry) => entry.props('domain').fqdn)).toEqual([
                'mail.example.org',
                'news.example.net',
            ])
        })
        wrapper.unmount()
    })

    it('hides the add button from users who may not create domains', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([verified])
        const wrapper = mountView(ListHost, {}, [{ action: 'read', subject: 'Domain' }])
        await vi.waitFor(() => expect(wrapper.text()).toContain('mail.example.org'))

        expect(wrapper.findAll('button').some((button) => button.text() === 'Add')).toBe(false)
        wrapper.unmount()
    })

    it('shows the add button to users who may create domains', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([verified])
        const wrapper = mountView(ListHost, {}, [{ action: ['read', 'create'], subject: 'Domain' }])
        await vi.waitFor(() => expect(wrapper.text()).toContain('mail.example.org'))

        expect(wrapper.findAll('button').some((button) => button.text() === 'Add')).toBe(true)
        wrapper.unmount()
    })
})
