import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import type { InboundFormSecurityDto, InboundFormSecurityUpsertDto } from 'api'
import SecurityDialog from '../partials/SecurityDialog.vue'
import { mountView } from '@/__tests__/support.ts'

vi.stubGlobal('visualViewport', undefined)
enableAutoUnmount(afterEach)

const recaptcha: InboundFormSecurityDto = {
    inboundFormSecurityId: 12,
    type: 'google-recaptcha',
    location: 'header',
    key: 'X-Recaptcha',
    config: { hasSecret: true, minScore: 0.7 },
}

function dialog() {
    return new DOMWrapper(document.body).get('.v-overlay__content')
}

async function openDialog(scheme: InboundFormSecurityDto | null) {
    const open = ref(false)
    const host = defineComponent({
        setup: () => () => h(SecurityDialog, { modelValue: open.value, scheme, saving: false }),
    })
    const wrapper = mountView(host)
    open.value = true
    await flushPromises()
    return wrapper.getComponent(SecurityDialog)
}

function savedSchemes(wrapper: Awaited<ReturnType<typeof openDialog>>): InboundFormSecurityUpsertDto[] {
    return (wrapper.emitted<[InboundFormSecurityUpsertDto]>('save') ?? []).map(([scheme]) => scheme)
}

describe('SecurityDialog', () => {
    it('defaults to a honeypot in the body without any config', async () => {
        const wrapper = await openDialog(null)

        expect(dialog().text()).toContain('Add scheme')
        expect(dialog().find('input[name="secret"]').exists()).toBe(false)
        await dialog().get('input[name="key"]').setValue('website')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(savedSchemes(wrapper)).toEqual([
                { type: 'honeypot', location: 'body', key: 'website', config: null },
            ])
        })
    })

    it('prefills a reCAPTCHA scheme, locks its type and keeps the stored secret when left empty', async () => {
        const wrapper = await openDialog(recaptcha)

        expect(dialog().text()).toContain('Edit')
        expect(dialog().find('.v-select.v-input--disabled').exists()).toBe(true)
        expect((dialog().get('input[name="key"]').element as HTMLInputElement).value).toBe('X-Recaptcha')
        expect((dialog().get('input[name="secret"]').element as HTMLInputElement).value).toBe('')
        expect(dialog().text()).toContain('Leave empty to keep the current secret')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(savedSchemes(wrapper)).toEqual([
                { type: 'google-recaptcha', location: 'header', key: 'X-Recaptcha', config: { minScore: 0.7 } },
            ])
        })
        expect(savedSchemes(wrapper)[0]!.config).not.toHaveProperty('secret')
    })

    it('sends a newly entered secret to replace the stored one', async () => {
        const wrapper = await openDialog(recaptcha)

        await dialog().get('input[name="secret"]').setValue('rotated')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(savedSchemes(wrapper)).toEqual([
                {
                    type: 'google-recaptcha',
                    location: 'header',
                    key: 'X-Recaptcha',
                    config: { secret: 'rotated', minScore: 0.7 },
                },
            ])
        })
    })

    it('masks the secret input', async () => {
        await openDialog(recaptcha)

        expect(dialog().get('input[name="secret"]').attributes('type')).toBe('password')
    })

    it('requires a secret for reCAPTCHA without a stored one', async () => {
        const wrapper = await openDialog({ ...recaptcha, config: null })

        expect(dialog().text()).not.toContain('Leave empty to keep the current secret')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().text()).toContain('This field is required')
        })
        expect(wrapper.emitted('save')).toBeUndefined()
    })

    it('requires a key', async () => {
        const wrapper = await openDialog(null)

        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().find('.v-input--error input[name="key"]').exists()).toBe(true)
        })
        expect(wrapper.emitted('save')).toBeUndefined()
    })
})
