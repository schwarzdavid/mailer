import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { VApp, VBtn } from 'vuetify/components'
import { DomainApi, type DomainDnsRecordDto, type DomainDto } from 'api'
import DeleteDomainDialog from '../dialogs/DeleteDomainDialog.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

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

const DialogHost = defineComponent({
    setup: () => () =>
        h(VApp, () =>
            h(
                DeleteDomainDialog,
                { domain },
                {
                    default: ({ props }: { props: Record<string, unknown> }) =>
                        h(VBtn, { ...props, class: 'open-dialog' }, () => 'Remove'),
                },
            ),
        ),
})

async function openDialog() {
    const wrapper = mountView(DialogHost)
    await wrapper.get('.open-dialog').trigger('click')
    await vi.waitFor(() => expect(dialogText()).toContain('Delete Domain'))
    return wrapper
}

function dialogText() {
    return document.body.querySelector('.v-overlay-container')?.textContent ?? ''
}

function isOpen() {
    return document.body.querySelector('.v-overlay--active') !== null
}

async function clickDialogButton(label: string) {
    const button = [...document.body.querySelectorAll<HTMLButtonElement>('.v-overlay-container button')].find(
        (candidate) => candidate.textContent?.trim() === label,
    )
    button!.click()
    await flushPromises()
}

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('DeleteDomainDialog', () => {
    it('asks to confirm the deletion of the named domain', async () => {
        const wrapper = await openDialog()

        expect(dialogText()).toContain('Do you really want to delete mail.example.org?')
        expect(dialogText()).toContain('This cannot be undone.')
        wrapper.unmount()
    })

    it('does nothing when aborted', async () => {
        const remove = vi.spyOn(DomainApi, 'deleteDomain')
        const wrapper = await openDialog()

        await clickDialogButton('Abort')

        await vi.waitFor(() => expect(isOpen()).toBe(false))
        expect(remove).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('deletes the domain and closes', async () => {
        const remove = vi.spyOn(DomainApi, 'deleteDomain').mockResolvedValue(undefined)
        const wrapper = await openDialog()

        await clickDialogButton('Delete')

        await vi.waitFor(() => expect(isOpen()).toBe(false))
        expect(remove).toHaveBeenCalledWith({ path: { domainId: 5 } })
        wrapper.unmount()
    })

    it('shows the API error and stays open when the domain is still in use', async () => {
        vi.spyOn(DomainApi, 'deleteDomain').mockRejectedValue({
            statusCode: 409,
            message: 'The domain is still used by inbound forms',
        })
        const wrapper = await openDialog()

        await clickDialogButton('Delete')

        await vi.waitFor(() => expect(dialogText()).toContain('The domain is still used by inbound forms'))
        expect(isOpen()).toBe(true)
        wrapper.unmount()
    })

    it('falls back to a generic error without a message', async () => {
        vi.spyOn(DomainApi, 'deleteDomain').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = await openDialog()

        await clickDialogButton('Delete')

        await vi.waitFor(() => expect(dialogText()).toContain('The domain could not be deleted'))
        wrapper.unmount()
    })
})
