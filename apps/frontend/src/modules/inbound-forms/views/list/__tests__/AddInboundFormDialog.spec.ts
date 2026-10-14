import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { DOMWrapper, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { VDialog } from 'vuetify/components'
import { InboundFormApi, ProjectApi, type InboundFormDto, type ProjectDetailDto } from 'api'
import type { Router } from 'vue-router'
import AddInboundFormDialog from '../partials/AddInboundFormDialog.vue'
import { mountView } from '@/__tests__/support.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const { push } = vi.hoisted(() => ({ push: vi.fn<Router['push']>() }))

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRouter: () => ({ push }) }
})

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))

vi.stubGlobal('visualViewport', undefined)
enableAutoUnmount(afterEach)

const project: ProjectDetailDto = {
    projectId: 5,
    name: 'Acme',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    domains: [],
}

const created: InboundFormDto = {
    inboundFormId: 9,
    projectId: 5,
    domainId: null,
    name: 'Contact Us',
    slug: 'contact-us',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
}

afterEach(() => {
    vi.restoreAllMocks()
    push.mockClear()
})

function dialog() {
    return new DOMWrapper(document.body).get('.v-overlay__content')
}

function slugValue(): string {
    return (dialog().get('input[name="slug"]').element as HTMLInputElement).value
}

function abortButton() {
    return dialog()
        .findAll('button')
        .find((button) => button.text() === 'Abort')!
}

async function openDialog() {
    vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(project)
    const wrapper = mountView(AddInboundFormDialog, {
        props: { projectId: 5 },
        slots: {
            default: (scope: { props: Record<string, unknown> }) => h('button', { class: 'open', ...scope.props }),
        },
    })
    await wrapper.get('button.open').trigger('click')
    await flushPromises()
    return wrapper
}

describe('AddInboundFormDialog', () => {
    it('derives a URL-safe slug from the name', async () => {
        await openDialog()

        await dialog().get('input[name="name"]').setValue('  Contact Us! 2026 ')

        expect(slugValue()).toBe('contact-us-2026')
    })

    it('stops deriving the slug once it was edited by hand', async () => {
        await openDialog()

        await dialog().get('input[name="name"]').setValue('Contact')
        await dialog().get('input[name="slug"]').setValue('my-form')
        await dialog().get('input[name="name"]').setValue('Contact Us')

        expect(slugValue()).toBe('my-form')
    })

    it('derives the slug again after the dialog was closed and reopened', async () => {
        const wrapper = await openDialog()

        await dialog().get('input[name="name"]').setValue('Contact')
        await dialog().get('input[name="slug"]').setValue('my-form')
        await abortButton().trigger('click')
        wrapper.getComponent(VDialog).vm.$emit('afterLeave')
        await flushPromises()
        await wrapper.get('button.open').trigger('click')
        await flushPromises()
        await dialog().get('input[name="name"]').setValue('Support')

        expect(slugValue()).toBe('support')
    })

    it('shows the api error and stays open when creating fails', async () => {
        vi.spyOn(InboundFormApi, 'createInboundForm').mockRejectedValue({ message: 'Slug is already taken' })
        await openDialog()

        await dialog().get('input[name="name"]').setValue('Contact Us')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().get('.v-alert').text()).toContain('Slug is already taken')
        })
        expect(push).not.toHaveBeenCalled()
    })

    it('falls back to a generic message when creating fails without one', async () => {
        vi.spyOn(InboundFormApi, 'createInboundForm').mockRejectedValue(new Response(null, { status: 500 }))
        await openDialog()

        await dialog().get('input[name="name"]').setValue('Contact Us')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().get('.v-alert').text()).toContain('The form could not be created')
        })
    })

    it('creates the form in the project and opens its details', async () => {
        const createSpy = vi.spyOn(InboundFormApi, 'createInboundForm').mockResolvedValue(created)
        await openDialog()

        await dialog().get('input[name="name"]').setValue('Contact Us')
        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(push).toHaveBeenCalledWith({
                name: RouteNames.INBOUND_FORM_DETAILS,
                params: { inboundFormId: 9 },
            })
        })
        expect(createSpy).toHaveBeenCalledWith({
            body: { name: 'Contact Us', slug: 'contact-us', domainId: null, projectId: 5 },
        })
    })

    it('does not create a form without a name', async () => {
        const createSpy = vi.spyOn(InboundFormApi, 'createInboundForm')
        await openDialog()

        await dialog().get('form').trigger('submit')

        await vi.waitFor(() => {
            expect(dialog().find('.v-input--error input[name="name"]').exists()).toBe(true)
        })
        expect(createSpy).not.toHaveBeenCalled()
        expect(push).not.toHaveBeenCalled()
    })
})
