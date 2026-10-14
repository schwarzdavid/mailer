import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { InboundFormApi, ProjectApi, type InboundFormDetailDto, type ProjectDetailDto } from 'api'
import GeneralCard from '../partials/GeneralCard.vue'
import { mountView } from '@/__tests__/support.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

const form: InboundFormDetailDto = {
    inboundFormId: 1,
    projectId: 5,
    domainId: null,
    name: 'Contact',
    slug: 'contact',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    fields: [],
    security: [],
    receivers: [],
}

const project: ProjectDetailDto = {
    projectId: 5,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    domains: [],
}

let writeText: Mock<Clipboard['writeText']>

beforeEach(() => {
    writeText = vi.fn<Clipboard['writeText']>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(() => {
    vi.restoreAllMocks()
})

function inputValue(wrapper: ReturnType<typeof mountView>, name: string): string {
    return (wrapper.get(`input[name="${name}"]`).element as HTMLInputElement).value
}

describe('GeneralCard', () => {
    it('prefills the form and shows its project and public endpoint', async () => {
        vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(project)
        const wrapper = mountView(GeneralCard, { props: { form } })

        expect(inputValue(wrapper, 'name')).toBe('Contact')
        expect(inputValue(wrapper, 'slug')).toBe('contact')
        expect(wrapper.html()).toContain(`${location.origin}/api/public/form/contact`)
        await vi.waitFor(() => {
            expect(wrapper.findAll('input').some((input) => input.element.value === 'Acme')).toBe(true)
        })
    })

    it('saves the edited values', async () => {
        vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(project)
        const updateSpy = vi
            .spyOn(InboundFormApi, 'updateInboundForm')
            .mockResolvedValue({ ...form, name: 'Support', slug: 'support-2' })
        const wrapper = mountView(GeneralCard, { props: { form } })

        await wrapper.get('input[name="name"]').setValue('Support')
        await wrapper.get('input[name="slug"]').setValue('support-2')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith({
                path: { inboundFormId: 1 },
                body: { name: 'Support', slug: 'support-2', domainId: null, isActive: true },
            })
        })
    })

    it('rejects slugs that are not URL safe', async () => {
        vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(project)
        const updateSpy = vi.spyOn(InboundFormApi, 'updateInboundForm')
        const wrapper = mountView(GeneralCard, { props: { form } })

        await wrapper.get('input[name="slug"]').setValue('Contact Us')
        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.find('.v-input--error input[name="slug"]').exists()).toBe(true)
        })
        expect(updateSpy).not.toHaveBeenCalled()
    })

    it('shows the api error when saving fails', async () => {
        vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(project)
        vi.spyOn(InboundFormApi, 'updateInboundForm').mockRejectedValue({ message: 'Slug is already taken' })
        const wrapper = mountView(GeneralCard, { props: { form } })

        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('Slug is already taken')
        })
    })

    it('falls back to a generic message when the error carries none', async () => {
        vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(project)
        vi.spyOn(InboundFormApi, 'updateInboundForm').mockRejectedValue(new Response(null, { status: 500 }))
        const wrapper = mountView(GeneralCard, { props: { form } })

        await wrapper.get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(wrapper.get('.v-alert').text()).toContain('The form could not be saved')
        })
    })

    it('copies the endpoint URL to the clipboard', async () => {
        vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(project)
        const wrapper = mountView(GeneralCard, { props: { form } })

        const copy = wrapper.findAll('button').find((button) => button.text() === 'Copy')
        await copy!.trigger('click')

        expect(writeText).toHaveBeenCalledWith(`${location.origin}/api/public/form/contact`)
        await vi.waitFor(() => {
            expect(wrapper.findAll('button').some((button) => button.text() === 'Copied')).toBe(true)
        })
    })
})
