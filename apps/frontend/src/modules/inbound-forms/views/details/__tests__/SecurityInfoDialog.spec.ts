import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InboundFormSecurityDto } from 'api'
import SecurityInfoDialog from '../partials/SecurityInfoDialog.vue'
import { mountDialog, overlayText } from '@/__tests__/support.ts'
import { formDetail } from '@/__tests__/fixtures.ts'

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    document.body.innerHTML = ''
})

function scheme(overrides: Partial<InboundFormSecurityDto>): InboundFormSecurityDto {
    return { inboundFormSecurityId: 1, type: 'honeypot', location: 'body', key: 'website', config: null, ...overrides }
}

async function openInfo(security: InboundFormSecurityDto) {
    mountDialog(SecurityInfoDialog, { scheme: security, form: formDetail({ slug: 'kontakt' }) })
    await vi.waitFor(() => expect(overlayText()).toContain('integration'))
}

describe('SecurityInfoDialog', () => {
    it('shows the hidden honeypot field and how to send its value', async () => {
        await openInfo(scheme({ type: 'honeypot', key: 'website' }))

        expect(overlayText()).toContain('<input name="website" tabindex="-1" autocomplete="off"')
        expect(overlayText()).toContain("security: { website: form.elements['website'].value }")
        expect(overlayText()).not.toContain('grecaptcha')
    })

    it('shows the reCAPTCHA script, token call with the expected action and placement', async () => {
        await openInfo(
            scheme({
                type: 'google-recaptcha',
                location: 'header',
                key: 'x-captcha',
                config: { expectedAction: 'contact' },
            }),
        )

        expect(overlayText()).toContain('https://www.google.com/recaptcha/api.js?render=SITE_KEY')
        expect(overlayText()).toContain("grecaptcha.execute('SITE_KEY', { action: 'contact' })")
        expect(overlayText()).toContain("'x-captcha': token")
    })

    it('shows the client script and the token call for the form slug', async () => {
        await openInfo(scheme({ type: 'timed-token', location: 'query', key: 'formToken' }))

        expect(overlayText()).toContain('/api/public/form/client.js')
        expect(overlayText()).toContain("InboundForm.getToken('kontakt')")
        expect(overlayText()).toContain('?formToken=${encodeURIComponent(token)}')
    })
})
