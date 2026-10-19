import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { VApp, VTextField } from 'vuetify/components'
import FormDialog from '../FormDialog.vue'
import ConfirmDialogHost from '../ConfirmDialogHost.vue'
import { mountView } from '@/__tests__/support.ts'

vi.stubGlobal('visualViewport', null)

function mountDialog(props: { dirty?: boolean; pending?: boolean; error?: string | null; submittable?: boolean } = {}) {
    const open = ref(true)
    const submitted = ref(0)
    const Host = defineComponent({
        setup: () => () =>
            h(VApp, () => [
                h(
                    FormDialog,
                    {
                        modelValue: open.value,
                        'onUpdate:modelValue': (value: boolean) => (open.value = value),
                        onSubmit: () => submitted.value++,
                        title: 'New project',
                        submitLabel: 'Create project',
                        ...props,
                    },
                    () => h(VTextField, { label: 'Name', name: 'name' }),
                ),
                h(ConfirmDialogHost),
            ]),
    })
    mountView(Host)
    return { open, submitted }
}

function buttonByText(text: string) {
    const button = [...document.body.querySelectorAll<HTMLButtonElement>('.v-overlay-container button')].find(
        (candidate) => candidate.textContent?.trim() === text,
    )
    if (!button) {
        throw new Error(`No button "${text}"`)
    }
    return button
}

afterEach(() => {
    document.body.innerHTML = ''
})

describe('FormDialog', () => {
    it('submits the form', async () => {
        const { submitted } = mountDialog()
        await vi.waitFor(() => expect(document.body.querySelector('form')).not.toBeNull())

        document.body.querySelector('form')!.dispatchEvent(new Event('submit'))

        expect(submitted.value).toBe(1)
    })

    it('ignores submits while pending', async () => {
        const { submitted } = mountDialog({ pending: true })
        await vi.waitFor(() => expect(document.body.querySelector('form')).not.toBeNull())

        document.body.querySelector('form')!.dispatchEvent(new Event('submit'))

        expect(submitted.value).toBe(0)
    })

    it('renders no submit button and ignores submit when not submittable', async () => {
        const { submitted } = mountDialog({ submittable: false })
        await vi.waitFor(() => expect(document.body.querySelector('form')).not.toBeNull())

        expect(document.body.querySelector('.v-overlay-container button[type="submit"]')).toBeNull()
        expect(buttonByText('Cancel')).toBeDefined()
        document.body.querySelector('form')!.dispatchEvent(new Event('submit'))

        expect(submitted.value).toBe(0)
    })

    it('closes a pristine dialog on cancel', async () => {
        const { open } = mountDialog()
        await vi.waitFor(() => expect(document.body.querySelector('form')).not.toBeNull())

        buttonByText('Cancel').click()
        await flushPromises()

        expect(open.value).toBe(false)
    })

    it('asks before discarding unsaved changes', async () => {
        const { open } = mountDialog({ dirty: true })
        await vi.waitFor(() => expect(document.body.querySelector('form')).not.toBeNull())

        buttonByText('Cancel').click()
        await vi.waitFor(() => expect(document.body.textContent).toContain('Discard unsaved changes?'))
        expect(open.value).toBe(true)

        buttonByText('Discard').click()
        await vi.waitFor(() => expect(open.value).toBe(false))
    })

    it('shows a save error inside the dialog', async () => {
        mountDialog({ error: 'Name is taken' })

        await vi.waitFor(() =>
            expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('Name is taken'),
        )
    })
})
