import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { VApp } from 'vuetify/components'
import type { RawRuleOf } from '@casl/ability'
import type { DomainDnsRecordDto, DomainDto } from 'api'
import type { Router } from 'vue-router'
import DomainListEntry from '../partials/DomainListEntry.vue'
import { mountView } from '@/__tests__/support.ts'
import type { AppAbility } from '@/plugins/casl.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

vi.stubGlobal('visualViewport', null)

const record: DomainDnsRecordDto = {
    current: null,
    host: 'mail.example.org',
    status: 'invalid',
    type: 'txt',
    use: 'spf',
    value: 'v=spf1 include:sending-domain.org -all',
}

const domain: DomainDto = {
    domainId: 5,
    fqdn: 'mail.example.org',
    rootDomain: 'example.org',
    dns: { spf: record, dkim: record, dmarc: record },
    lastCheckedAt: null,
}

const EntryHost = defineComponent({
    setup: () => () => h(VApp, () => h(DomainListEntry, { domain })),
})

function mountEntry(rules?: RawRuleOf<AppAbility>[]) {
    return mountView(EntryHost, {}, rules)
}

function menuItems() {
    return [...document.body.querySelectorAll('.v-overlay-container .v-list-item')].map((item) =>
        item.textContent?.trim(),
    )
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
    document.body.innerHTML = ''
})

describe('DomainListEntry', () => {
    it('offers deleting the domain from its menu without opening the detail page', async () => {
        const wrapper = mountEntry()

        await wrapper.get('.mdi-dots-vertical').trigger('click')

        await vi.waitFor(() => expect(menuItems()).toEqual(['Delete']))
        expect(push).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('opens the confirmation dialog for the domain', async () => {
        const wrapper = mountEntry()
        await wrapper.get('.mdi-dots-vertical').trigger('click')
        await vi.waitFor(() => expect(menuItems()).toEqual(['Delete']))

        document.body.querySelector<HTMLElement>('.v-overlay-container .v-list-item')!.click()

        await vi.waitFor(() =>
            expect(document.body.textContent).toContain('Do you really want to delete mail.example.org?'),
        )
        wrapper.unmount()
    })

    it('hides the menu from users who may not delete domains', () => {
        const wrapper = mountEntry([{ action: 'read', subject: 'Domain' }])

        expect(wrapper.find('.mdi-dots-vertical').exists()).toBe(false)
        expect(wrapper.text()).toContain('mail.example.org')
        wrapper.unmount()
    })
})
