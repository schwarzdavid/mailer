import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboundFormApi, ProjectApi } from 'api'
import ProjectFormsCard from '../partials/ProjectFormsCard.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { formListItem, projectDetail, receiver } from '@/__tests__/fixtures.ts'

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('ProjectFormsCard', () => {
    it('links every form with its slug, receivers and status', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([
            formListItem(),
            formListItem({
                inboundFormId: 10,
                name: 'Newsletter',
                slug: 'newsletter',
                isActive: false,
                receivers: [receiver(), receiver({ inboundFormReceiverId: 2, publishedVersion: null })],
            }),
        ])
        const wrapper = mountInApp(ProjectFormsCard, { project: projectDetail(), canUpdate: true })

        await vi.waitFor(() => expect(wrapper.text()).toContain('Newsletter'))
        const rows = wrapper.findAll('a.list-row')
        expect(rows).toHaveLength(2)
        expect(rows[0]!.text()).toContain('contact-request')
        expect(rows[0]!.text()).toContain('1 receiver')
        expect(rows[0]!.text()).toContain('Active')
        expect(rows[1]!.text()).toContain('2 receivers')
        expect(rows[1]!.text()).toContain('No template')
        expect(rows[1]!.text()).toContain('Inactive')
    })

    it('flags a form without allowed domains as open to any website', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([formListItem({ allowedHostnames: [] })])
        const wrapper = mountInApp(ProjectFormsCard, { project: projectDetail(), canUpdate: true })

        await vi.waitFor(() => expect(wrapper.text()).toContain('Any website'))
    })

    it('shows no open-origin warning once domains are allowed', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([
            formListItem({ allowedHostnames: ['kunde.at'] }),
        ])
        const wrapper = mountInApp(ProjectFormsCard, { project: projectDetail(), canUpdate: true })

        await vi.waitFor(() => expect(wrapper.text()).toContain('Contact request'))
        expect(wrapper.text()).not.toContain('Any website')
    })

    it('explains an empty project', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([])
        const wrapper = mountInApp(ProjectFormsCard, { project: projectDetail(), canUpdate: true })

        await vi.waitFor(() => expect(wrapper.text()).toContain('No forms yet'))
    })

    it('opens the new form dialog from the header', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([])
        vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(projectDetail())
        const wrapper = mountInApp(ProjectFormsCard, { project: projectDetail(), canUpdate: true })

        await findButton(wrapper, 'New form')!.trigger('click')

        await vi.waitFor(() => expect(document.body.textContent).toContain('New inbound form'))
    })

    it('hides creation without update rights', async () => {
        vi.spyOn(InboundFormApi, 'getInboundForms').mockResolvedValue([])
        const wrapper = mountInApp(ProjectFormsCard, { project: projectDetail(), canUpdate: false })

        await vi.waitFor(() => expect(wrapper.text()).toContain('No forms yet'))
        expect(findButton(wrapper, 'New form')).toBeUndefined()
    })
})
