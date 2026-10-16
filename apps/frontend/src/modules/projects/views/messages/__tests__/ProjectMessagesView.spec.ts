import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusManager } from '@tanstack/vue-query'
import { MailMessageApi, ProjectApi } from 'api'
import ProjectMessagesView from '../ProjectMessagesView.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { mailMessage, projectDetail } from '@/__tests__/fixtures.ts'

const route = vi.hoisted(() => ({ params: { projectId: '1' }, name: 'projects::messages', query: {} }))

vi.mock('vue-router', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vue-router')>()),
    useRoute: () => route,
}))

vi.stubGlobal('visualViewport', null)

afterEach(() => {
    focusManager.setFocused(undefined)
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

function mockProject() {
    vi.spyOn(ProjectApi, 'getProject').mockResolvedValue(projectDetail())
}

describe('ProjectMessagesView', () => {
    it('lists sent mail with status, source and recipient', async () => {
        mockProject()
        vi.spyOn(MailMessageApi, 'getProjectMessages').mockResolvedValue({
            items: [
                mailMessage({ sentAt: new Date('2026-10-01T10:00:05Z') }),
                mailMessage({
                    mailMessageId: 71,
                    sentAt: null,
                    createdAt: new Date('2026-10-02T09:00:00Z'),
                    source: 'inbound_form',
                    apiKeyId: null,
                    emailTo: 'owner@acme.com',
                    status: 'failed',
                    error: 'connect ECONNREFUSED',
                }),
            ],
            total: 2,
        })
        const wrapper = mountInApp(ProjectMessagesView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('reader@example.org'))
        await vi.waitFor(() => expect(wrapper.text()).toContain('Acme Website'))
        const rows = wrapper.findAll('tbody tr').map((row) => row.text())
        expect(rows[0]).toContain('Welcome aboard')
        expect(rows[0]).toContain('API')
        expect(rows[0]).toContain('Sent')
        expect(rows[1]).toContain('owner@acme.com')
        expect(rows[1]).toContain('Form')
        expect(rows[1]).toContain('Failed')
        expect(rows[1]).toContain('connect ECONNREFUSED')
        const sentTimes = wrapper.findAll('tbody tr time').map((time) => time.attributes('datetime'))
        expect(sentTimes).toEqual(['2026-10-01T10:00:05.000Z', '2026-10-02T09:00:00.000Z'])
        expect(wrapper.text()).toContain('2 messages')
        expect(wrapper.text()).toContain('1–2 of 2')
    })

    it('requests the first page of the project log', async () => {
        mockProject()
        const getSpy = vi.spyOn(MailMessageApi, 'getProjectMessages').mockResolvedValue({ items: [], total: 0 })
        mountInApp(ProjectMessagesView)

        await vi.waitFor(() =>
            expect(getSpy).toHaveBeenCalledWith({
                path: { projectId: 1 },
                query: { page: 1, itemsPerPage: 25, search: undefined, source: undefined, status: undefined },
            }),
        )
    })

    it('filters by status', async () => {
        mockProject()
        const getSpy = vi
            .spyOn(MailMessageApi, 'getProjectMessages')
            .mockResolvedValue({ items: [mailMessage()], total: 1 })
        const wrapper = mountInApp(ProjectMessagesView)
        await vi.waitFor(() => expect(wrapper.text()).toContain('reader@example.org'))

        await wrapper
            .findAll('.filter-chip')
            .find((chip) => chip.text() === 'Failed')!
            .trigger('click')

        await vi.waitFor(() =>
            expect(getSpy).toHaveBeenLastCalledWith({
                path: { projectId: 1 },
                query: expect.objectContaining({ status: 'failed', source: undefined, page: 1 }) as object,
            }),
        )
    })

    it('filters by source', async () => {
        mockProject()
        const getSpy = vi
            .spyOn(MailMessageApi, 'getProjectMessages')
            .mockResolvedValue({ items: [mailMessage()], total: 1 })
        const wrapper = mountInApp(ProjectMessagesView)
        await vi.waitFor(() => expect(wrapper.text()).toContain('reader@example.org'))

        await wrapper
            .findAll('.filter-chip')
            .find((chip) => chip.text() === 'Forms')!
            .trigger('click')

        await vi.waitFor(() =>
            expect(getSpy).toHaveBeenLastCalledWith({
                path: { projectId: 1 },
                query: expect.objectContaining({ source: 'inbound_form', status: undefined, page: 1 }) as object,
            }),
        )
    })

    it('shows progress on retry after a background refresh fails', async () => {
        mockProject()
        let phase: 'loaded' | 'offline' | 'retrying' = 'loaded'
        vi.spyOn(MailMessageApi, 'getProjectMessages').mockImplementation(() => {
            if (phase === 'loaded') {
                return Promise.resolve({ items: [mailMessage()], total: 1 })
            }
            return phase === 'offline' ? Promise.reject(new Error('offline')) : new Promise(() => {})
        })
        const wrapper = mountInApp(ProjectMessagesView)
        await vi.waitFor(() => expect(wrapper.text()).toContain('reader@example.org'))

        phase = 'offline'
        focusManager.setFocused(false)
        focusManager.setFocused(true)
        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't load sent mail"))
        expect(wrapper.get('.state-panel .v-btn').classes()).not.toContain('v-btn--loading')

        phase = 'retrying'
        await findButton(wrapper, 'Try again')!.trigger('click')

        await vi.waitFor(() => expect(wrapper.get('.state-panel .v-btn').classes()).toContain('v-btn--loading'))
    })

    it('explains an empty log', async () => {
        mockProject()
        vi.spyOn(MailMessageApi, 'getProjectMessages').mockResolvedValue({ items: [], total: 0 })
        const wrapper = mountInApp(ProjectMessagesView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('No mail sent yet'))
    })

    it('shows the not-found state for a project the user cannot read', async () => {
        vi.spyOn(ProjectApi, 'getProject').mockRejectedValue({ statusCode: 404, message: 'Not found' })
        vi.spyOn(MailMessageApi, 'getProjectMessages').mockRejectedValue({ statusCode: 404, message: 'Not found' })
        const wrapper = mountInApp(ProjectMessagesView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("This project doesn't exist"))
    })
})
