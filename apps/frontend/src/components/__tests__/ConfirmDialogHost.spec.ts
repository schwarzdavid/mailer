import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { VApp } from 'vuetify/components'
import ConfirmDialogHost from '../ConfirmDialogHost.vue'
import { useConfirm } from '@/composables/useConfirm.ts'
import { mountView } from '@/__tests__/support.ts'

vi.stubGlobal('visualViewport', null)

const Host = defineComponent({
    setup: () => () => h(VApp, () => h(ConfirmDialogHost)),
})

function buttonByText(text: string) {
    const button = [...document.body.querySelectorAll<HTMLButtonElement>('.v-overlay-container button')].find(
        (candidate) => candidate.textContent?.trim() === text,
    )
    if (!button) {
        throw new Error(`No button "${text}"`)
    }
    return button
}

async function waitForDialog() {
    await vi.waitFor(() => expect(document.body.querySelector('.confirm-dialog')).not.toBeNull())
}

afterEach(() => {
    document.body.innerHTML = ''
})

describe('ConfirmDialogHost', () => {
    it('resolves true when confirmed', async () => {
        mountView(Host)
        const result = useConfirm()({ title: 'Publish draft?', confirmLabel: 'Publish' })
        await waitForDialog()

        expect(document.body.textContent).toContain('Publish draft?')
        buttonByText('Publish').click()

        await expect(result).resolves.toBe(true)
    })

    it('resolves false when cancelled', async () => {
        mountView(Host)
        const result = useConfirm()({ title: 'Delete project?', confirmLabel: 'Delete', destructive: true })
        await waitForDialog()

        buttonByText('Cancel').click()

        await expect(result).resolves.toBe(false)
    })

    it('resolves false on Escape', async () => {
        mountView(Host)
        const result = useConfirm()({ title: 'Delete project?', confirmLabel: 'Delete', destructive: true })
        await waitForDialog()

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

        await expect(result).resolves.toBe(false)
    })

    it('keeps the dialog open and shows the error when the action fails', async () => {
        mountView(Host)
        const action: Mock<() => Promise<unknown>> = vi
            .fn<() => Promise<unknown>>()
            .mockRejectedValue({ message: 'Domain in use' })
        const result = useConfirm()({ title: 'Delete domain?', confirmLabel: 'Delete', destructive: true, action })
        await waitForDialog()

        buttonByText('Delete').click()
        await flushPromises()

        await vi.waitFor(() =>
            expect(document.body.querySelector('.confirm-dialog')?.textContent).toContain('Domain in use'),
        )
        expect(action).toHaveBeenCalledOnce()

        buttonByText('Cancel').click()
        await expect(result).resolves.toBe(false)
    })

    it('resolves true once the action succeeds', async () => {
        mountView(Host)
        const action: Mock<() => Promise<unknown>> = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)
        const result = useConfirm()({ title: 'Delete form?', confirmLabel: 'Delete', destructive: true, action })
        await waitForDialog()

        buttonByText('Delete').click()

        await expect(result).resolves.toBe(true)
        expect(action).toHaveBeenCalledOnce()
    })
})
