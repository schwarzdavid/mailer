import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { VSelect } from 'vuetify/components'
import type { RawRuleOf } from '@casl/ability'
import { DomainApi, ProjectApi, type DomainDnsRecordDto, type DomainDto, type ProjectDetailDto } from 'api'
import ProjectDomainsCard from '../partials/ProjectDomainsCard.vue'
import { mountView } from '@/__tests__/support.ts'
import type { AppAbility } from '@/plugins/casl.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', undefined)
enableAutoUnmount(afterEach)

const record: DomainDnsRecordDto = { current: null, host: '', status: 'valid', type: 'txt', use: 'spf', value: '' }

function domain(domainId: number, fqdn: string): DomainDto {
    return {
        domainId,
        fqdn,
        rootDomain: fqdn,
        dns: { spf: record, dkim: { ...record, use: 'dkim' }, dmarc: { ...record, use: 'dmarc' } },
        lastCheckedAt: null,
    }
}

const assigned = domain(3, 'mail.acme.com')
const available = domain(4, 'mail.other.com')

const project: ProjectDetailDto = {
    projectId: 1,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    domains: [assigned],
}

const manager: RawRuleOf<AppAbility>[] = [
    { action: ['read', 'update'], subject: 'Project', conditions: { projectId: 1 } },
    { action: 'read', subject: 'Domain' },
]

afterEach(() => {
    vi.restoreAllMocks()
})

describe('ProjectDomainsCard', () => {
    it('shows the empty hint without assigned domains', () => {
        const wrapper = mountView(ProjectDomainsCard, { props: { project: { ...project, domains: [] } } }, [
            { action: 'read', subject: 'Project' },
        ])

        expect(wrapper.text()).toContain('No domains assigned yet')
    })

    it('lists assigned domains read-only without update rights and does not load all domains', () => {
        const domainsSpy = vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([assigned, available])
        const wrapper = mountView(ProjectDomainsCard, { props: { project } }, [
            { action: 'read', subject: 'Project', conditions: { projectId: 1 } },
            { action: 'read', subject: 'Domain' },
        ])

        expect(wrapper.text()).toContain('mail.acme.com')
        expect(wrapper.find('button').exists()).toBe(false)
        expect(wrapper.findComponent(VSelect).exists()).toBe(false)
        expect(domainsSpy).not.toHaveBeenCalled()
    })

    it('hides domain management from project editors who cannot read domains', () => {
        const domainsSpy = vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([assigned, available])
        const wrapper = mountView(ProjectDomainsCard, { props: { project } }, [
            { action: ['read', 'update'], subject: 'Project', conditions: { projectId: 1 } },
        ])

        expect(wrapper.findComponent(VSelect).exists()).toBe(false)
        expect(domainsSpy).not.toHaveBeenCalled()
    })

    it('offers only domains that are not yet assigned', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([assigned, available])
        const wrapper = mountView(ProjectDomainsCard, { props: { project } }, manager)

        await vi.waitFor(() => {
            expect(wrapper.getComponent(VSelect).props('items')).toEqual([available])
        })
    })

    it('assigns the selected domain', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([assigned, available])
        const assignSpy = vi.spyOn(ProjectApi, 'assignProjectDomain').mockResolvedValue(undefined)
        const wrapper = mountView(ProjectDomainsCard, { props: { project } }, manager)
        await flushPromises()

        const assign = () => wrapper.findAll('button').find((button) => button.text() === 'Assign')!
        expect(assign().attributes('disabled')).toBeDefined()
        await wrapper.getComponent(VSelect).setValue(4)
        await assign().trigger('click')

        await vi.waitFor(() => {
            expect(assignSpy).toHaveBeenCalledWith({ path: { projectId: 1 }, body: { domainId: 4 } })
        })
    })

    it('shows an assign specific message when assigning fails without an api message', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([assigned, available])
        vi.spyOn(ProjectApi, 'assignProjectDomain').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = mountView(ProjectDomainsCard, { props: { project } }, manager)
        await flushPromises()

        await wrapper.getComponent(VSelect).setValue(4)
        await wrapper
            .findAll('button')
            .find((button) => button.text() === 'Assign')!
            .trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('The domain could not be assigned')
        })
    })

    it('shows the remove specific message when unassigning fails without an api message', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([assigned, available])
        vi.spyOn(ProjectApi, 'unassignProjectDomain').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = mountView(ProjectDomainsCard, { props: { project } }, manager)

        await wrapper.get('.v-list-item button').trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('The domain could not be removed')
        })
    })

    it('unassigns a domain', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([assigned, available])
        const unassignSpy = vi.spyOn(ProjectApi, 'unassignProjectDomain').mockResolvedValue(undefined)
        const wrapper = mountView(ProjectDomainsCard, { props: { project } }, manager)

        await wrapper.get('.v-list-item button').trigger('click')

        await vi.waitFor(() => {
            expect(unassignSpy).toHaveBeenCalledWith({ path: { projectId: 1, domainId: 3 } })
        })
    })

    it('shows the api error when unassigning fails', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([assigned, available])
        vi.spyOn(ProjectApi, 'unassignProjectDomain').mockRejectedValue({ message: 'Domain is used by a form' })
        const wrapper = mountView(ProjectDomainsCard, { props: { project } }, manager)

        await wrapper.get('.v-list-item button').trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('Domain is used by a form')
        })
    })
})
