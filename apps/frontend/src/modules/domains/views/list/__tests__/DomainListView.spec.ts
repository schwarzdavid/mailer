import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi } from 'api'
import DomainListView from '../DomainListView.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { domain } from '@/__tests__/fixtures.ts'

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('DomainListView', () => {
    it('lists every domain as a link with its verification state', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([
            domain(),
            domain({ domainId: 6, fqdn: 'acme-careers.com' }, 'invalid'),
        ])
        const wrapper = mountInApp(DomainListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('acme-careers.com'))
        const rows = wrapper.findAll('a.list-row')
        expect(rows).toHaveLength(2)
        expect(rows[0]!.text()).toContain('Valid')
        expect(rows[0]!.text()).toContain('Not checked yet')
        expect(rows[1]!.text()).toContain('Invalid')
    })

    it('explains how to start without domains', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([])
        const wrapper = mountInApp(DomainListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Add your first sender domain'))
    })

    it('opens the new domain dialog', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([domain()])
        const wrapper = mountInApp(DomainListView)

        await findButton(wrapper, 'New domain')!.trigger('click')

        await vi.waitFor(() => expect(document.body.textContent).toContain('New sender domain'))
    })

    it('hides creation from users who may not create domains', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([domain()])
        const wrapper = mountInApp(DomainListView, {}, [{ action: 'read', subject: 'Domain' }])

        await vi.waitFor(() => expect(wrapper.text()).toContain('forms.acme.com'))
        expect(findButton(wrapper, 'New domain')).toBeUndefined()
    })

    it('shows a retryable error when loading fails', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockRejectedValue(new Error('offline'))
        const wrapper = mountInApp(DomainListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't load domains"))
        expect(wrapper.text()).not.toContain('Add your first sender domain')
    })
})
