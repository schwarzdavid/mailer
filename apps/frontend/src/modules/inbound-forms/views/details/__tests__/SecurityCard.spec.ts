import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboundFormApi, type InboundFormSecurityDto } from 'api'
import SecurityCard from '../partials/SecurityCard.vue'
import { findButton, mountInApp, setOverlayInput, submitOverlayForm } from '@/__tests__/support.ts'
import { formDetail } from '@/__tests__/fixtures.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('SecurityCard', () => {
    it('keeps the settings of untouched schemes when saving another one', async () => {
        const security: InboundFormSecurityDto[] = [
            {
                inboundFormSecurityId: 1,
                type: 'google-recaptcha',
                location: 'body',
                key: 'g-recaptcha-response',
                config: { hasSecret: true, minScore: 0.5, expectedAction: 'contact' },
            },
            {
                inboundFormSecurityId: 2,
                type: 'timed-token',
                location: 'body',
                key: 'formToken',
                config: { minDelaySeconds: 5, maxAgeSeconds: 600 },
            },
        ]
        const updateSpy = vi.spyOn(InboundFormApi, 'updateInboundFormSecurity').mockResolvedValue(security)
        const wrapper = mountInApp(SecurityCard, {
            form: formDetail({ allowedHostnames: ['kunde.at'], security }),
            canUpdate: true,
        })

        await vi.waitFor(() => expect(findButton(wrapper, 'Add check')).toBeDefined())
        await findButton(wrapper, 'Add check')!.trigger('click')
        await vi.waitFor(() => expect(document.body.querySelector('.v-overlay-container [name="key"]')).not.toBeNull())
        await setOverlayInput('key', 'website')
        submitOverlayForm()

        await vi.waitFor(() =>
            expect(updateSpy).toHaveBeenCalledWith({
                path: { inboundFormId: 9 },
                body: {
                    security: [
                        {
                            type: 'google-recaptcha',
                            location: 'body',
                            key: 'g-recaptcha-response',
                            config: {
                                minScore: 0.5,
                                expectedAction: 'contact',
                                minDelaySeconds: undefined,
                                maxAgeSeconds: undefined,
                            },
                        },
                        {
                            type: 'timed-token',
                            location: 'body',
                            key: 'formToken',
                            config: {
                                minScore: undefined,
                                expectedAction: undefined,
                                minDelaySeconds: 5,
                                maxAgeSeconds: 600,
                            },
                        },
                        { type: 'honeypot', location: 'body', key: 'website', config: null },
                    ],
                },
            }),
        )
    })
})
