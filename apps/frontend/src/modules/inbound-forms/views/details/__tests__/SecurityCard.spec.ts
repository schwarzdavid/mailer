import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { InboundFormApi, type InboundFormDetailDto, type InboundFormSecurityDto } from 'api'
import SecurityCard from '../partials/SecurityCard.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', undefined)
enableAutoUnmount(afterEach)

const security: InboundFormSecurityDto[] = [
    { inboundFormSecurityId: 11, type: 'honeypot', location: 'body', key: 'website', config: null },
    {
        inboundFormSecurityId: 12,
        type: 'google-recaptcha',
        location: 'header',
        key: 'X-Recaptcha',
        config: { secret: 's3cret', minScore: 0.5 },
    },
]

const form: InboundFormDetailDto = {
    inboundFormId: 1,
    projectId: 5,
    domainId: null,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    fields: [],
    security,
    receivers: [],
}

afterEach(() => {
    vi.restoreAllMocks()
})

function dialog() {
    return new DOMWrapper(document.body).get('.v-overlay__content')
}

describe('SecurityCard', () => {
    it('shows the empty hint without schemes', () => {
        const wrapper = mountView(SecurityCard, { props: { form: { ...form, security: [] } } })

        expect(wrapper.text()).toContain('No security schemes configured')
    })

    it('lists schemes with translated type and location', () => {
        const wrapper = mountView(SecurityCard, { props: { form } })

        const items = wrapper.findAll('.v-list-item')
        expect(items).toHaveLength(2)
        expect(items[0]!.text()).toContain('Honeypot')
        expect(items[0]!.text()).toContain('Body')
        expect(items[0]!.text()).toContain('website')
        expect(items[1]!.text()).toContain('Google reCAPTCHA')
        expect(items[1]!.text()).toContain('Header')
    })

    it('removes a scheme by saving the others with their config', async () => {
        const updateSpy = vi.spyOn(InboundFormApi, 'updateInboundFormSecurity').mockResolvedValue([security[1]!])
        const wrapper = mountView(SecurityCard, { props: { form } })

        await wrapper.findAll('.v-list-item')[0]!.findAll('button')[1]!.trigger('click')

        await vi.waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith({
                path: { inboundFormId: 1 },
                body: {
                    security: [
                        {
                            type: 'google-recaptcha',
                            location: 'header',
                            key: 'X-Recaptcha',
                            config: { secret: 's3cret', minScore: 0.5 },
                        },
                    ],
                },
            })
        })
    })

    it('shows the api error when removing a scheme fails', async () => {
        vi.spyOn(InboundFormApi, 'updateInboundFormSecurity').mockRejectedValue({ message: 'Form not found' })
        const wrapper = mountView(SecurityCard, { props: { form } })

        await wrapper.findAll('.v-list-item')[0]!.findAll('button')[1]!.trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('Form not found')
        })
    })

    it('keeps the dialog open with the error when saving a scheme fails', async () => {
        vi.spyOn(InboundFormApi, 'updateInboundFormSecurity').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = mountView(SecurityCard, { props: { form } })

        await wrapper.findAll('.v-list-item')[0]!.findAll('button')[0]!.trigger('click')
        await flushPromises()
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().get('.v-alert').text()).toContain('The security schemes could not be saved')
        })
    })

    it('replaces the scheme of the same type when one is saved', async () => {
        const updateSpy = vi.spyOn(InboundFormApi, 'updateInboundFormSecurity').mockResolvedValue(security)
        const wrapper = mountView(SecurityCard, { props: { form } })

        await wrapper.findAll('.v-list-item')[0]!.findAll('button')[0]!.trigger('click')
        await flushPromises()
        await dialog().get('input[name="key"]').setValue('homepage')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith({
                path: { inboundFormId: 1 },
                body: {
                    security: [
                        {
                            type: 'google-recaptcha',
                            location: 'header',
                            key: 'X-Recaptcha',
                            config: { secret: 's3cret', minScore: 0.5 },
                        },
                        { type: 'honeypot', location: 'body', key: 'homepage', config: null },
                    ],
                },
            })
        })
    })
})
