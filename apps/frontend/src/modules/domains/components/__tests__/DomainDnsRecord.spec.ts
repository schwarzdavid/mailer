import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { useClipboard } from '@vueuse/core'
import type { DomainDnsRecordDto } from 'api'
import DomainDnsRecord from '../DomainDnsRecord.vue'
import { mountView } from '@/__tests__/support.ts'

type Clipboard = ReturnType<typeof useClipboard>

const clipboard = vi.hoisted(() => ({
    copy: vi.fn<Clipboard['copy']>(),
    supported: { value: false },
}))

vi.mock('@vueuse/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@vueuse/core')>()
    return {
        ...actual,
        useClipboard: () => ({ copy: clipboard.copy, isSupported: ref(clipboard.supported.value) }),
    }
})

const record: DomainDnsRecordDto = {
    current: null,
    host: '_dmarc.mail.example.org',
    status: 'invalid',
    type: 'txt',
    use: 'dmarc',
    value: 'v=DMARC1; p=reject',
}

function inputValues(wrapper: ReturnType<typeof mountView>) {
    return wrapper.findAll('input').map((input) => (input.element as HTMLInputElement).value)
}

afterEach(() => {
    clipboard.copy.mockReset()
    clipboard.supported.value = false
})

describe('DomainDnsRecord', () => {
    it('shows the record type, host and expected value read-only', () => {
        const wrapper = mountView(DomainDnsRecord, { props: { record } })

        expect(wrapper.text()).toContain('TXT')
        expect(inputValues(wrapper)).toEqual(['_dmarc.mail.example.org', 'v=DMARC1; p=reject'])
        expect(wrapper.findAll('input').every((input) => input.attributes('readonly') !== undefined)).toBe(true)
    })

    it('flags an invalid record', () => {
        const wrapper = mountView(DomainDnsRecord, { props: { record } })

        expect(wrapper.text()).toContain('Invalid')
        expect(wrapper.find('.mdi-alert').exists()).toBe(true)
    })

    it('flags a valid record', () => {
        const wrapper = mountView(DomainDnsRecord, { props: { record: { ...record, status: 'valid' } } })

        expect(wrapper.text()).toContain('Valid')
        expect(wrapper.text()).not.toContain('Invalid')
    })

    it('hides the copy buttons when the clipboard is unavailable', () => {
        const wrapper = mountView(DomainDnsRecord, { props: { record } })

        expect(wrapper.find('.mdi-clipboard-outline').exists()).toBe(false)
    })

    it('copies host and value to the clipboard', async () => {
        clipboard.supported.value = true
        clipboard.copy.mockResolvedValue()
        const wrapper = mountView(DomainDnsRecord, { props: { record } })

        const copyButtons = wrapper.findAll('button').filter((button) => button.find('.mdi-clipboard-outline').exists())
        expect(copyButtons).toHaveLength(2)

        await copyButtons[0]!.trigger('click')
        expect(clipboard.copy).toHaveBeenLastCalledWith('_dmarc.mail.example.org')

        await copyButtons[1]!.trigger('click')
        expect(clipboard.copy).toHaveBeenLastCalledWith('v=DMARC1; p=reject')
    })
})
