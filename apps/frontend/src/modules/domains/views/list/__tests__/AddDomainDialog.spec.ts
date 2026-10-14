import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainApi } from 'api'
import type { Router } from 'vue-router'
import AddDomainDialog from '../partials/AddDomainDialog.vue'
import { mountDialog, overlayText, setOverlayInput, submitOverlayForm } from '@/__tests__/support.ts'
import { domain } from '@/__tests__/fixtures.ts'
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

afterEach(() => {
    vi.restoreAllMocks()
    push.mockReset()
    document.body.innerHTML = ''
})

async function openDialog() {
    const result = mountDialog(AddDomainDialog)
    await vi.waitFor(() => expect(document.body.querySelector('input[name="fqdn"]')).not.toBeNull())
    return result
}

describe('AddDomainDialog', () => {
    it('does not create a domain for an invalid name', async () => {
        const create = vi.spyOn(DomainApi, 'createDomain')
        await openDialog()

        await setOverlayInput('fqdn', 'localhost')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Enter a domain name'))
        expect(create).not.toHaveBeenCalled()
    })

    it('recommends a subdomain for an apex domain but allows it', async () => {
        await openDialog()

        await setOverlayInput('fqdn', 'acme-careers.com')

        await vi.waitFor(() => expect(overlayText()).toContain('Use a subdomain if you can'))
        expect(overlayText()).toContain('mail.acme-careers.com')
    })

    it('does not warn about a subdomain', async () => {
        await openDialog()

        await setOverlayInput('fqdn', 'forms.acme.com')

        expect(overlayText()).not.toContain('Use a subdomain if you can')
    })

    it('creates the domain and opens its detail page', async () => {
        push.mockResolvedValue(undefined)
        const create = vi.spyOn(DomainApi, 'createDomain').mockResolvedValue(domain({ domainId: 6 }))
        const { open } = await openDialog()

        await setOverlayInput('fqdn', 'forms.acme.com')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(push).toHaveBeenCalledWith({ name: RouteNames.DOMAIN_DETAILS, params: { domainId: 6 } }),
        )
        expect(create).toHaveBeenCalledWith({ body: { fqdn: 'forms.acme.com' } })
        expect(open.value).toBe(false)
    })

    it('keeps the dialog open with the error when creating fails', async () => {
        vi.spyOn(DomainApi, 'createDomain').mockRejectedValue({ message: 'Domain already exists' })
        const { open } = await openDialog()

        await setOverlayInput('fqdn', 'forms.acme.com')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Domain already exists'))
        expect(open.value).toBe(true)
    })
})
