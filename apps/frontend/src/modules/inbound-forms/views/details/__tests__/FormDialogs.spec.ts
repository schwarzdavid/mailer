import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { InboundFormFieldUpsertDto, InboundFormReceiverCreateDto, InboundFormSecurityUpsertDto } from 'api'
import FieldDialog from '../partials/FieldDialog.vue'
import ReceiverDialog from '../partials/ReceiverDialog.vue'
import SecurityDialog from '../partials/SecurityDialog.vue'
import AllowedHostnamesDialog from '../partials/AllowedHostnamesDialog.vue'
import { defineComponent, h, ref } from 'vue'
import { VApp } from 'vuetify/components'
import {
    mountDialog,
    mountView,
    overlayInput,
    overlayText,
    setOverlayInput,
    submitOverlayForm,
} from '@/__tests__/support.ts'
import { formDetail } from '@/__tests__/fixtures.ts'

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    document.body.innerHTML = ''
})

async function waitForInput(name: string) {
    await vi.waitFor(() => expect(document.body.querySelector(`.v-overlay-container [name="${name}"]`)).not.toBeNull())
}

describe('FieldDialog', () => {
    it('builds the field with its text rules', async () => {
        const onSave: Mock<(field: InboundFormFieldUpsertDto) => void> =
            vi.fn<(field: InboundFormFieldUpsertDto) => void>()
        mountDialog(FieldDialog, { field: null, existingKeys: ['email'], saving: false, onSave })
        await waitForInput('key')

        await setOverlayInput('key', 'message')
        await setOverlayInput('label', 'Message')
        await setOverlayInput('maxLength', '5000')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(onSave).toHaveBeenCalledWith({
                key: 'message',
                label: 'Message',
                type: 'text',
                defaultValue: null,
                validation: { maxLength: 5000 },
            }),
        )
    })

    it('rejects a key that another field uses', async () => {
        const onSave: Mock<(field: InboundFormFieldUpsertDto) => void> =
            vi.fn<(field: InboundFormFieldUpsertDto) => void>()
        mountDialog(FieldDialog, { field: null, existingKeys: ['email'], saving: false, onSave })
        await waitForInput('key')

        await setOverlayInput('key', 'email')
        await setOverlayInput('label', 'Email')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Another field already uses this key.'))
        expect(onSave).not.toHaveBeenCalled()
    })

    it('names the minimum when the maximum length is smaller', async () => {
        const onSave: Mock<(field: InboundFormFieldUpsertDto) => void> =
            vi.fn<(field: InboundFormFieldUpsertDto) => void>()
        mountDialog(FieldDialog, { field: null, existingKeys: [], saving: false, onSave })
        await waitForInput('key')

        await setOverlayInput('key', 'name')
        await setOverlayInput('label', 'Name')
        await setOverlayInput('minLength', '10')
        await setOverlayInput('maxLength', '5')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Must be at least the minimum length (10).'))
        expect(onSave).not.toHaveBeenCalled()
    })
})

describe('SecurityDialog', () => {
    it('requires a secret for a new reCAPTCHA check', async () => {
        const onSave: Mock<(scheme: InboundFormSecurityUpsertDto) => void> =
            vi.fn<(scheme: InboundFormSecurityUpsertDto) => void>()
        mountDialog(SecurityDialog, {
            scheme: null,
            takenTypes: ['honeypot', 'timed-token'],
            hasHostnames: true,
            saving: false,
            onSave,
        })
        await waitForInput('key')

        expect(overlayText()).toContain('Google reCAPTCHA')
        await setOverlayInput('key', 'g-recaptcha-response')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Fill in this field.'))
        expect(onSave).not.toHaveBeenCalled()

        await setOverlayInput('secret', 'secret-key')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(onSave).toHaveBeenCalledWith({
                type: 'google-recaptcha',
                location: 'body',
                key: 'g-recaptcha-response',
                config: { secret: 'secret-key', minScore: undefined },
            }),
        )
    })

    it('locks the type while editing and keeps the stored secret', async () => {
        const onSave: Mock<(scheme: InboundFormSecurityUpsertDto) => void> =
            vi.fn<(scheme: InboundFormSecurityUpsertDto) => void>()
        mountDialog(SecurityDialog, {
            scheme: {
                inboundFormSecurityId: 1,
                type: 'google-recaptcha',
                location: 'body',
                key: 'token',
                config: { hasSecret: true, minScore: 0.5 },
            },
            takenTypes: ['google-recaptcha'],
            hasHostnames: true,
            saving: false,
            onSave,
        })
        await waitForInput('key')

        expect(overlayText()).toContain("The type can't change.")
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(onSave).toHaveBeenCalledWith({
                type: 'google-recaptcha',
                location: 'body',
                key: 'token',
                config: { minScore: 0.5 },
            }),
        )
    })

    it('hides the location for honeypots and saves body', async () => {
        const onSave: Mock<(scheme: InboundFormSecurityUpsertDto) => void> =
            vi.fn<(scheme: InboundFormSecurityUpsertDto) => void>()
        mountDialog(SecurityDialog, {
            scheme: null,
            takenTypes: ['google-recaptcha', 'timed-token'],
            hasHostnames: true,
            saving: false,
            onSave,
        })
        await waitForInput('key')

        expect(document.body.querySelector('.v-overlay-container [name="location"]')).toBeNull()
        await setOverlayInput('key', 'website')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(onSave).toHaveBeenCalledWith({ type: 'honeypot', location: 'body', key: 'website', config: null }),
        )
    })

    it('saves the expected action for recaptcha', async () => {
        const onSave: Mock<(scheme: InboundFormSecurityUpsertDto) => void> =
            vi.fn<(scheme: InboundFormSecurityUpsertDto) => void>()
        mountDialog(SecurityDialog, {
            scheme: null,
            takenTypes: ['honeypot', 'timed-token'],
            hasHostnames: true,
            saving: false,
            onSave,
        })
        await waitForInput('key')

        await setOverlayInput('key', 'g-recaptcha-response')
        await setOverlayInput('secret', 'secret-key')
        await setOverlayInput('expectedAction', 'contact')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(onSave).toHaveBeenCalledWith({
                type: 'google-recaptcha',
                location: 'body',
                key: 'g-recaptcha-response',
                config: { secret: 'secret-key', minScore: undefined, expectedAction: 'contact' },
            }),
        )
    })

    it('sends the stored expected action when editing without changes', async () => {
        const onSave: Mock<(scheme: InboundFormSecurityUpsertDto) => void> =
            vi.fn<(scheme: InboundFormSecurityUpsertDto) => void>()
        mountDialog(SecurityDialog, {
            scheme: {
                inboundFormSecurityId: 1,
                type: 'google-recaptcha',
                location: 'header',
                key: 'token',
                config: { hasSecret: true, expectedAction: 'contact' },
            },
            takenTypes: ['google-recaptcha'],
            hasHostnames: true,
            saving: false,
            onSave,
        })
        await waitForInput('key')

        submitOverlayForm()

        await vi.waitFor(() =>
            expect(onSave).toHaveBeenCalledWith({
                type: 'google-recaptcha',
                location: 'header',
                key: 'token',
                config: { minScore: undefined, expectedAction: 'contact' },
            }),
        )
    })

    it('saves timed-token settings with defaults', async () => {
        const onSave: Mock<(scheme: InboundFormSecurityUpsertDto) => void> =
            vi.fn<(scheme: InboundFormSecurityUpsertDto) => void>()
        mountDialog(SecurityDialog, {
            scheme: null,
            takenTypes: ['google-recaptcha', 'honeypot'],
            hasHostnames: true,
            saving: false,
            onSave,
        })
        await waitForInput('key')

        expect(overlayInput('key').value).toBe('formToken')
        expect(overlayInput('minDelaySeconds').value).toBe('3')
        expect(overlayInput('maxAgeSeconds').value).toBe('3600')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(onSave).toHaveBeenCalledWith({
                type: 'timed-token',
                location: 'body',
                key: 'formToken',
                config: { minDelaySeconds: 3, maxAgeSeconds: 3600 },
            }),
        )
    })

    it.each([
        ['minDelaySeconds', '0', '3600'],
        ['minDelaySeconds', '61', '3600'],
        ['maxAgeSeconds', '59', '3'],
        ['maxAgeSeconds', '86401', '3'],
    ])('rejects %s of %s', async (name, value) => {
        const onSave: Mock<(scheme: InboundFormSecurityUpsertDto) => void> =
            vi.fn<(scheme: InboundFormSecurityUpsertDto) => void>()
        mountDialog(SecurityDialog, {
            scheme: null,
            takenTypes: ['google-recaptcha', 'honeypot'],
            hasHostnames: true,
            saving: false,
            onSave,
        })
        await waitForInput('key')

        await setOverlayInput(name, value)
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(document.body.querySelector('.v-overlay-container .v-input--error')).not.toBeNull(),
        )
        expect(onSave).not.toHaveBeenCalled()
    })

    it('disables the timed token without allowed domains', async () => {
        const onSave: Mock<(scheme: InboundFormSecurityUpsertDto) => void> =
            vi.fn<(scheme: InboundFormSecurityUpsertDto) => void>()
        mountDialog(SecurityDialog, {
            scheme: null,
            takenTypes: ['google-recaptcha', 'honeypot'],
            hasHostnames: false,
            saving: false,
            onSave,
        })
        await waitForInput('key')

        expect(overlayText()).toContain('Add allowed domains first to use the timed token.')
        overlayInput('type')
            .closest('.v-field')!
            .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await vi.waitFor(() => expect(document.body.querySelector('.v-list-item--disabled')).not.toBeNull())
        expect(document.body.querySelector('.v-list-item--disabled')!.textContent).toContain('Timed token')
    })
})

describe('ReceiverDialog', () => {
    const emailFields = formDetail()
        .fields.filter((field) => field.type === 'email')
        .map((field) => ({ key: field.key, label: field.label }))

    it('prefills the sender from the domain and saves the receiver', async () => {
        const onSave: Mock<(receiver: InboundFormReceiverCreateDto) => void> =
            vi.fn<(receiver: InboundFormReceiverCreateDto) => void>()
        mountDialog(ReceiverDialog, {
            receiver: null,
            emailFields,
            domainFqdn: 'forms.acme.com',
            saving: false,
            onSave,
        })
        await waitForInput('emailFrom')

        expect(document.body.querySelector<HTMLInputElement>('[name="emailFrom"]')!.value).toBe(
            'noreply@forms.acme.com',
        )
        await setOverlayInput('emailReceiver', 'sales@acme.com')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(onSave).toHaveBeenCalledWith({
                emailFrom: 'noreply@forms.acme.com',
                emailReceiver: 'sales@acme.com',
                emailReplyTo: null,
                isActive: true,
            }),
        )
    })

    it('rejects a sender outside the form domain', async () => {
        const onSave: Mock<(receiver: InboundFormReceiverCreateDto) => void> =
            vi.fn<(receiver: InboundFormReceiverCreateDto) => void>()
        mountDialog(ReceiverDialog, {
            receiver: null,
            emailFields,
            domainFqdn: 'forms.acme.com',
            saving: false,
            onSave,
        })
        await waitForInput('emailFrom')

        await setOverlayInput('emailFrom', 'noreply@other.com')
        await setOverlayInput('emailReceiver', 'sales@acme.com')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Use an address ending in @forms.acme.com.'))
        expect(onSave).not.toHaveBeenCalled()
    })
})

describe('ReceiverDialog while the sender domain loads', () => {
    it('fills the sender once the domain arrives', async () => {
        const domainFqdn = ref<string | null>(null)
        const Host = defineComponent({
            setup: () => () =>
                h(VApp, () =>
                    h(ReceiverDialog, {
                        modelValue: true,
                        receiver: null,
                        emailFields: [],
                        domainFqdn: domainFqdn.value,
                        saving: false,
                    }),
                ),
        })
        mountView(Host)
        await waitForInput('emailFrom')
        expect(document.body.querySelector<HTMLInputElement>('[name="emailFrom"]')!.value).toBe('')

        domainFqdn.value = 'forms.acme.com'

        await vi.waitFor(() =>
            expect(document.body.querySelector<HTMLInputElement>('[name="emailFrom"]')!.value).toBe(
                'noreply@forms.acme.com',
            ),
        )
    })
})

async function commitHostname(value: string) {
    await setOverlayInput('hostnames', value)
    overlayInput('hostnames').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve))
}

describe('AllowedHostnamesDialog', () => {
    it('normalizes and deduplicates the domains it saves', async () => {
        const onSave: Mock<(hostnames: string[]) => void> = vi.fn<(hostnames: string[]) => void>()
        mountDialog(AllowedHostnamesDialog, { hostnames: [], saving: false, onSave })
        await waitForInput('hostnames')

        await commitHostname('Kunde.at')
        await commitHostname('kunde.at')
        submitOverlayForm()

        await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith(['kunde.at']))
    })

    it('rejects a value with a scheme', async () => {
        const onSave: Mock<(hostnames: string[]) => void> = vi.fn<(hostnames: string[]) => void>()
        mountDialog(AllowedHostnamesDialog, { hostnames: [], saving: false, onSave })
        await waitForInput('hostnames')

        await commitHostname('https://kunde.at')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain('Enter a domain name'))
        expect(onSave).not.toHaveBeenCalled()
    })
})
