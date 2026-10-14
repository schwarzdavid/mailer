import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, reactive } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import type { InboundFormFieldDto, InboundFormFieldUpsertDto } from 'api'
import FieldDialog from '../partials/FieldDialog.vue'
import { mountView } from '@/__tests__/support.ts'

vi.stubGlobal('visualViewport', undefined)
enableAutoUnmount(afterEach)

const numberField: InboundFormFieldDto = {
    inboundFormFieldId: 22,
    key: 'age',
    label: 'Age',
    type: 'number',
    defaultValue: '18',
    validation: { required: true, min: 18, max: 120 },
}

function dialog() {
    return new DOMWrapper(document.body).get('.v-overlay__content')
}

type DialogState = { modelValue: boolean; field: InboundFormFieldDto | null }

async function openDialog(
    field: InboundFormFieldDto | null,
    state = reactive<DialogState>({ modelValue: false, field }),
) {
    const host = defineComponent({ setup: () => () => h(FieldDialog, { ...state, saving: false }) })
    const wrapper = mountView(host)
    state.modelValue = true
    await flushPromises()
    return wrapper.getComponent(FieldDialog)
}

function savedFields(wrapper: Awaited<ReturnType<typeof openDialog>>): InboundFormFieldUpsertDto[] {
    return (wrapper.emitted<[InboundFormFieldUpsertDto]>('save') ?? []).map(([field]) => field)
}

describe('FieldDialog', () => {
    it('emits a plain text field without validation for a minimal new field', async () => {
        const wrapper = await openDialog(null)

        expect(dialog().text()).toContain('Add field')
        await dialog().get('input[name="key"]').setValue('firstName')
        await dialog().get('input[name="label"]').setValue('First name')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(savedFields(wrapper)).toEqual([
                { key: 'firstName', label: 'First name', type: 'text', defaultValue: null, validation: null },
            ])
        })
    })

    it('collects the required flag and text constraints into the validation object', async () => {
        const wrapper = await openDialog(null)

        await dialog().get('input[name="key"]').setValue('message')
        await dialog().get('input[name="label"]').setValue('Message')
        await dialog().get('input[name="defaultValue"]').setValue('Hello')
        await dialog().get('input[name="required"]').setValue(true)
        await dialog().get('input[name="minLength"]').setValue('10')
        await dialog().get('input[name="maxLength"]').setValue('500')
        await dialog().get('input[name="pattern"]').setValue('^[a-z ]+$')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(savedFields(wrapper)).toEqual([
                {
                    key: 'message',
                    label: 'Message',
                    type: 'text',
                    defaultValue: 'Hello',
                    validation: { required: true, minLength: 10, maxLength: 500, pattern: '^[a-z ]+$' },
                },
            ])
        })
    })

    it('prefills an existing number field and keeps its range constraints', async () => {
        const wrapper = await openDialog(numberField)

        expect(dialog().text()).toContain('Edit')
        expect((dialog().get('input[name="key"]').element as HTMLInputElement).value).toBe('age')
        expect((dialog().get('input[name="label"]').element as HTMLInputElement).value).toBe('Age')
        expect((dialog().get('input[name="min"]').element as HTMLInputElement).value).toBe('18')
        expect((dialog().get('input[name="max"]').element as HTMLInputElement).value).toBe('120')
        expect(dialog().find('input[name="minLength"]').exists()).toBe(false)
        expect(dialog().find('input[name="pattern"]').exists()).toBe(false)

        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(savedFields(wrapper)).toEqual([
                {
                    key: 'age',
                    label: 'Age',
                    type: 'number',
                    defaultValue: '18',
                    validation: { required: true, min: 18, max: 120 },
                },
            ])
        })
    })

    it('rejects keys that cannot be used as template placeholders', async () => {
        const wrapper = await openDialog(null)

        await dialog().get('input[name="key"]').setValue('first name')
        await dialog().get('input[name="label"]').setValue('First name')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().find('.v-input--error input[name="key"]').exists()).toBe(true)
        })
        expect(wrapper.emitted('save')).toBeUndefined()
    })

    it('requires key and label', async () => {
        const wrapper = await openDialog(null)

        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().find('.v-input--error input[name="key"]').exists()).toBe(true)
            expect(dialog().find('.v-input--error input[name="label"]').exists()).toBe(true)
        })
        expect(wrapper.emitted('save')).toBeUndefined()
    })

    it('resets to the edited field each time it is reopened', async () => {
        const state = reactive<DialogState>({ modelValue: false, field: null })
        await openDialog(null, state)
        await dialog().get('input[name="key"]').setValue('leftover')

        state.modelValue = false
        await flushPromises()
        state.field = numberField
        state.modelValue = true
        await flushPromises()

        expect((dialog().get('input[name="key"]').element as HTMLInputElement).value).toBe('age')
    })

    it('asks the parent to close when aborted', async () => {
        const wrapper = await openDialog(null)

        const abort = dialog()
            .findAll('button')
            .find((button) => button.text() === 'Abort')
        await abort!.trigger('click')

        expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    })
})
