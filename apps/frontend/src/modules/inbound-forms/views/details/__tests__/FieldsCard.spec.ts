import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { InboundFormApi, type InboundFormDetailDto, type InboundFormFieldDto } from 'api'
import FieldsCard from '../partials/FieldsCard.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', undefined)
enableAutoUnmount(afterEach)

const fields: InboundFormFieldDto[] = [
    {
        inboundFormFieldId: 21,
        key: 'email',
        label: 'Email',
        type: 'email',
        defaultValue: null,
        validation: { required: true },
    },
    {
        inboundFormFieldId: 22,
        key: 'message',
        label: 'Message',
        type: 'text',
        defaultValue: 'Hi',
        validation: { maxLength: 500 },
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
    fields,
    security: [],
    receivers: [],
}

afterEach(() => {
    vi.restoreAllMocks()
})

function dialog() {
    return new DOMWrapper(document.body).get('.v-overlay__content')
}

function rowButtons(wrapper: ReturnType<typeof mountView>, key: string) {
    const row = wrapper.findAll('tbody tr').find((candidate) => candidate.find('code').text() === key)
    return row!.findAll('button')
}

describe('FieldsCard', () => {
    it('shows the empty hint when the form has no fields', () => {
        const wrapper = mountView(FieldsCard, { props: { form: { ...form, fields: [] } } })

        expect(wrapper.text()).toContain('No fields defined yet')
        expect(wrapper.find('table').exists()).toBe(false)
    })

    it('lists each field with its translated type and required marker', () => {
        const wrapper = mountView(FieldsCard, { props: { form } })

        const rows = wrapper.findAll('tbody tr')
        expect(rows).toHaveLength(2)
        expect(rows[0]!.text()).toContain('email')
        expect(rows[0]!.text()).toContain('Email')
        expect(rows[0]!.find('.mdi-check').exists()).toBe(true)
        expect(rows[1]!.text()).toContain('Text')
        expect(rows[1]!.find('.mdi-check').exists()).toBe(false)
    })

    it('removes a field by saving the remaining fields', async () => {
        const updateSpy = vi.spyOn(InboundFormApi, 'updateInboundFormFields').mockResolvedValue([fields[1]!])
        const wrapper = mountView(FieldsCard, { props: { form } })

        await rowButtons(wrapper, 'email')[1]!.trigger('click')

        await vi.waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith({
                path: { inboundFormId: 1 },
                body: {
                    fields: [
                        {
                            key: 'message',
                            label: 'Message',
                            type: 'text',
                            defaultValue: 'Hi',
                            validation: { maxLength: 500 },
                        },
                    ],
                },
            })
        })
    })

    it('shows the api error when removing a field fails', async () => {
        vi.spyOn(InboundFormApi, 'updateInboundFormFields').mockRejectedValue({ message: 'Field is in use' })
        const wrapper = mountView(FieldsCard, { props: { form } })

        await rowButtons(wrapper, 'email')[1]!.trigger('click')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('Field is in use')
        })
    })

    it('keeps the dialog open with the error when saving a field fails', async () => {
        vi.spyOn(InboundFormApi, 'updateInboundFormFields').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = mountView(FieldsCard, { props: { form } })

        const add = wrapper.findAll('button').find((button) => button.text() === 'Add field')
        await add!.trigger('click')
        await flushPromises()
        await dialog().get('input[name="key"]').setValue('phone')
        await dialog().get('input[name="label"]').setValue('Phone')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().get('.v-alert').text()).toContain('The fields could not be saved')
        })
        expect(wrapper.find('.v-alert').exists()).toBe(false)
    })

    it('appends a new field to the existing ones', async () => {
        const updateSpy = vi.spyOn(InboundFormApi, 'updateInboundFormFields').mockResolvedValue(fields)
        const wrapper = mountView(FieldsCard, { props: { form } })

        const add = wrapper.findAll('button').find((button) => button.text() === 'Add field')
        await add!.trigger('click')
        await flushPromises()
        await dialog().get('input[name="key"]').setValue('phone')
        await dialog().get('input[name="label"]').setValue('Phone')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith({
                path: { inboundFormId: 1 },
                body: {
                    fields: [
                        {
                            key: 'email',
                            label: 'Email',
                            type: 'email',
                            defaultValue: null,
                            validation: { required: true },
                        },
                        {
                            key: 'message',
                            label: 'Message',
                            type: 'text',
                            defaultValue: 'Hi',
                            validation: { maxLength: 500 },
                        },
                        { key: 'phone', label: 'Phone', type: 'text', defaultValue: null, validation: null },
                    ],
                },
            })
        })
    })

    it('replaces an edited field in place, even when its key is renamed', async () => {
        const updateSpy = vi.spyOn(InboundFormApi, 'updateInboundFormFields').mockResolvedValue(fields)
        const wrapper = mountView(FieldsCard, { props: { form } })

        await rowButtons(wrapper, 'email')[0]!.trigger('click')
        await flushPromises()
        expect((dialog().get('input[name="key"]').element as HTMLInputElement).value).toBe('email')
        await dialog().get('input[name="key"]').setValue('contactEmail')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith({
                path: { inboundFormId: 1 },
                body: {
                    fields: [
                        {
                            key: 'contactEmail',
                            label: 'Email',
                            type: 'email',
                            defaultValue: null,
                            validation: { required: true },
                        },
                        {
                            key: 'message',
                            label: 'Message',
                            type: 'text',
                            defaultValue: 'Hi',
                            validation: { maxLength: 500 },
                        },
                    ],
                },
            })
        })
    })
})
