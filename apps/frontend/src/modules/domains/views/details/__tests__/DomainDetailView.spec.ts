import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { DomainApi, type DomainDnsRecordDto, type DomainDto } from 'api'
import DomainDetailView from '../DomainDetailView.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const invalid: DomainDnsRecordDto = {
    current: null,
    host: 'mail.example.org',
    status: 'invalid',
    type: 'txt',
    use: 'spf',
    value: 'v=spf1 include:sending-domain.org -all',
}

const valid: DomainDnsRecordDto = { ...invalid, status: 'valid', current: invalid.value }

const domain: DomainDto = {
    domainId: 5,
    fqdn: 'mail.example.org',
    rootDomain: 'example.org',
    dns: { spf: invalid, dkim: invalid, dmarc: invalid },
    lastCheckedAt: null,
}

async function createTestRouter(): Promise<Router> {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/domains', name: RouteNames.DOMAIN_LIST, component: { template: '<div />' } },
            { path: '/domains/:domainId', name: RouteNames.DOMAIN_DETAILS, component: DomainDetailView },
        ],
    })
    await router.push('/domains/5')
    return router
}

async function mountDetail() {
    const router = await createTestRouter()
    return mountView(DomainDetailView, { global: { plugins: [router] } })
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('DomainDetailView', () => {
    it('loads the domain from the route parameter', async () => {
        const getDomain = vi.spyOn(DomainApi, 'getDomain').mockResolvedValue(domain)
        const wrapper = await mountDetail()

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toBe('mail.example.org'))
        expect(getDomain).toHaveBeenCalledWith({ path: { domainId: 5 } })
    })

    it('shows a spinner until the domain arrives', async () => {
        vi.spyOn(DomainApi, 'getDomain').mockReturnValue(new Promise(() => {}))
        const wrapper = await mountDetail()

        expect(wrapper.find('.v-progress-circular').exists()).toBe(true)
        expect(wrapper.find('h1').exists()).toBe(false)
    })

    it('shows the DNS records and the overall verification state', async () => {
        vi.spyOn(DomainApi, 'getDomain').mockResolvedValue(domain)
        const wrapper = await mountDetail()

        await vi.waitFor(() => expect(wrapper.text()).toContain('DNS Records'))
        expect(wrapper.text()).toContain('Invalid')
        expect(wrapper.get('a').attributes('href')).toBe('/domains')
    })

    it('updates the page after refreshing the records', async () => {
        vi.spyOn(DomainApi, 'getDomain').mockResolvedValue(domain)
        vi.spyOn(DomainApi, 'refreshDomainRecords').mockResolvedValue({
            ...domain,
            dns: { spf: valid, dkim: valid, dmarc: valid },
            lastCheckedAt: new Date(2026, 9, 1, 14, 5, 9),
        })
        const wrapper = await mountDetail()
        await vi.waitFor(() => expect(wrapper.text()).toContain('DNS Records'))

        const refreshButton = wrapper.findAll('button').find((button) => button.text() === 'Refresh')
        await refreshButton!.trigger('click')

        await vi.waitFor(() => expect(wrapper.text()).toContain('Last checked at 01.10.2026 14:05:09'))
        expect(wrapper.text()).not.toContain('Invalid')
    })
})
