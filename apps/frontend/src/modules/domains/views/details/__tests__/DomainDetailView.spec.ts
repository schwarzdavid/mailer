import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { DomainApi } from 'api'
import type { Router } from 'vue-router'
import DomainDetailView from '../DomainDetailView.vue'
import { findButton, mountInApp, overlayButton, overlayText } from '@/__tests__/support.ts'
import { dnsRecord, domain, domainDetail } from '@/__tests__/fixtures.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('@vueuse/router', () => ({
    useRouteParams: () => ref(5),
}))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

const notifications = useNotificationHost()

afterEach(() => {
    vi.restoreAllMocks()
    push.mockReset()
    notifications.dismiss()
    document.body.innerHTML = ''
})

describe('DomainDetailView', () => {
    it('shows the records, status and projects using the domain', async () => {
        vi.spyOn(DomainApi, 'getDomain').mockResolvedValue(
            domainDetail({ projects: [{ projectId: 1, name: 'Acme Website' }] }),
        )
        const wrapper = mountInApp(DomainDetailView)

        await vi.waitFor(() => expect(wrapper.get('h1').text()).toContain('forms.acme.com'))
        expect(wrapper.text()).toContain('3 of 3 records valid')
        expect(wrapper.text()).toContain('Used by Acme Website')
        expect(wrapper.find('a.list-row').text()).toContain('Acme Website')
    })

    it('blocks deleting a domain in use and explains why', async () => {
        vi.spyOn(DomainApi, 'getDomain').mockResolvedValue(
            domainDetail({ projects: [{ projectId: 1, name: 'Acme Website' }] }),
        )
        const wrapper = mountInApp(DomainDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Unassign it there before you can delete it.'))
        expect(findButton(wrapper, 'Delete domain…')!.attributes('disabled')).toBeDefined()
    })

    it('deletes an unused domain after confirmation', async () => {
        push.mockResolvedValue(undefined)
        vi.spyOn(DomainApi, 'getDomain').mockResolvedValue(domainDetail())
        const remove = vi.spyOn(DomainApi, 'deleteDomain').mockResolvedValue(undefined)
        const wrapper = mountInApp(DomainDetailView)

        await vi.waitFor(() => expect(findButton(wrapper, 'Delete domain…')).toBeDefined())
        await findButton(wrapper, 'Delete domain…')!.trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Delete domain forms.acme.com?'))
        overlayButton('Delete domain').click()

        await vi.waitFor(() => expect(push).toHaveBeenCalledWith({ name: RouteNames.DOMAIN_LIST }))
        expect(remove).toHaveBeenCalledWith({ path: { domainId: 5 } })
    })

    it('checks the records again and keeps the projects', async () => {
        vi.spyOn(DomainApi, 'getDomain').mockResolvedValue(
            domainDetail({
                dns: { spf: dnsRecord({ status: 'invalid' }), dkim: dnsRecord(), dmarc: dnsRecord() },
                projects: [{ projectId: 1, name: 'Acme Website' }],
            }),
        )
        const refresh = vi.spyOn(DomainApi, 'refreshDomainRecords').mockResolvedValue(domain())
        const wrapper = mountInApp(DomainDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('2 of 3 records valid'))
        await findButton(wrapper, 'Check again')!.trigger('click')

        await vi.waitFor(() => expect(wrapper.text()).toContain('3 of 3 records valid'))
        expect(refresh).toHaveBeenCalledWith({ path: { domainId: 5 } })
        expect(wrapper.text()).toContain('Used by Acme Website')
    })

    it('reports a failed check with a retry', async () => {
        vi.spyOn(DomainApi, 'getDomain').mockResolvedValue(domainDetail())
        vi.spyOn(DomainApi, 'refreshDomainRecords').mockRejectedValue(new Error('timeout'))
        const wrapper = mountInApp(DomainDetailView)

        await vi.waitFor(() => expect(findButton(wrapper, 'Check again')).toBeDefined())
        await findButton(wrapper, 'Check again')!.trigger('click')

        await vi.waitFor(() => expect(notifications.current.value?.text).toBe("Couldn't check DNS for forms.acme.com"))
        expect(notifications.current.value?.retry).toBeDefined()
    })

    it('shows the not-found state', async () => {
        vi.spyOn(DomainApi, 'getDomain').mockRejectedValue({ statusCode: 404 })
        const wrapper = mountInApp(DomainDetailView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("This domain doesn't exist"))
    })

    it('hides check and delete for read-only users', async () => {
        vi.spyOn(DomainApi, 'getDomain').mockResolvedValue(domainDetail())
        const wrapper = mountInApp(DomainDetailView, {}, [{ action: 'read', subject: 'Domain' }])

        await vi.waitFor(() => expect(wrapper.text()).toContain('records valid'))
        expect(findButton(wrapper, 'Check again')).toBeUndefined()
        expect(wrapper.text()).not.toContain('Delete domain')
    })
})
