import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi, ProjectApi } from 'api'
import ProjectDomainsCard from '../partials/ProjectDomainsCard.vue'
import { findButton, mountInApp, overlayButton, overlayText } from '@/__tests__/support.ts'
import { domain, projectDetail } from '@/__tests__/fixtures.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

const notifications = useNotificationHost()

afterEach(() => {
    vi.restoreAllMocks()
    notifications.dismiss()
    document.body.innerHTML = ''
})

describe('ProjectDomainsCard', () => {
    it('warns that nothing can send without a sender domain', () => {
        const wrapper = mountInApp(ProjectDomainsCard, { project: projectDetail(), canUpdate: true })

        expect(wrapper.text()).toContain("Forms here can't send mail yet")
    })

    it('shows each domain with its DNS status and a link to its records', () => {
        const wrapper = mountInApp(ProjectDomainsCard, {
            project: projectDetail({ domains: [domain({}, 'invalid')] }),
            canUpdate: true,
        })

        expect(wrapper.text()).toContain('forms.acme.com')
        expect(wrapper.text()).toContain('SPF, DKIM and DMARC need attention')
        expect(wrapper.text()).toContain('Invalid')
        expect(wrapper.text()).toContain('View DNS records')
    })

    it('unassigns a domain only after the undo window', async () => {
        const unassign = vi.spyOn(ProjectApi, 'unassignProjectDomain').mockResolvedValue(undefined)
        const wrapper = mountInApp(ProjectDomainsCard, {
            project: projectDetail({ domains: [domain()] }),
            canUpdate: true,
        })

        await wrapper.get('button[aria-label="Unassign forms.acme.com"]').trigger('click')

        expect(wrapper.text()).not.toContain('View DNS records')
        expect(notifications.current.value?.text).toBe('forms.acme.com unassigned')
        expect(unassign).not.toHaveBeenCalled()

        notifications.dismiss()
        await vi.waitFor(() => expect(unassign).toHaveBeenCalledWith({ path: { projectId: 1, domainId: 5 } }))
    })

    it('restores the row when the user undoes', async () => {
        const unassign = vi.spyOn(ProjectApi, 'unassignProjectDomain').mockResolvedValue(undefined)
        const wrapper = mountInApp(ProjectDomainsCard, {
            project: projectDetail({ domains: [domain()] }),
            canUpdate: true,
        })

        await wrapper.get('button[aria-label="Unassign forms.acme.com"]').trigger('click')
        notifications.undo()

        await vi.waitFor(() => expect(wrapper.text()).toContain('View DNS records'))
        expect(unassign).not.toHaveBeenCalled()
    })

    it('requires a domain before assigning', async () => {
        vi.spyOn(DomainApi, 'getDomains').mockResolvedValue([
            domain({ domainId: 6, fqdn: 'mail.northwind.io' }),
            domain({ domainId: 7, fqdn: 'acme-careers.com' }, 'invalid'),
        ])
        const assign = vi.spyOn(ProjectApi, 'assignProjectDomain').mockResolvedValue(undefined)
        const wrapper = mountInApp(ProjectDomainsCard, { project: projectDetail(), canUpdate: true })

        await findButton(wrapper, 'Assign domain')!.trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Assign sender domain'))

        overlayButton('Assign domain').click()
        await vi.waitFor(() => expect(overlayText()).toContain('Choose a domain.'))
        expect(assign).not.toHaveBeenCalled()
    })

    it('hides assign and unassign without update rights', () => {
        const wrapper = mountInApp(ProjectDomainsCard, {
            project: projectDetail({ domains: [domain()] }),
            canUpdate: false,
        })

        expect(findButton(wrapper, 'Assign domain')).toBeUndefined()
        expect(wrapper.find('button[aria-label="Unassign forms.acme.com"]').exists()).toBe(false)
    })
})
