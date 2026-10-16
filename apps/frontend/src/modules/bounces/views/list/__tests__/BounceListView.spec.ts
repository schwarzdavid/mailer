import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusManager } from '@tanstack/vue-query'
import { BounceApi, type BounceDto, type EmailBlockDto } from 'api'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import BounceListView from '../BounceListView.vue'
import { findButton, mountInApp } from '@/__tests__/support.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'
import { RouteNames } from '@/router/RouteNames.ts'

const { route } = vi.hoisted(() => {
    const route: Pick<RouteLocationNormalizedLoaded, 'name' | 'meta'> = { name: '', meta: {} }
    return { route }
})

vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('vue-router')>()
    return { ...actual, useRoute: () => route }
})

vi.stubGlobal('visualViewport', null)

const notifications = useNotificationHost()

const bounces: BounceDto[] = [
    {
        bounceId: 1,
        emailAddress: 'j.smith@gmial.com',
        type: 'permanent',
        statusCode: '5.1.1',
        reason: 'User unknown',
        receivedAt: new Date('2026-10-01T10:00:00.000Z'),
    },
    {
        bounceId: 2,
        emailAddress: 'sarah@outlook.com',
        type: 'transient',
        statusCode: null,
        reason: 'Mailbox full',
        receivedAt: new Date('2026-09-30T10:00:00.000Z'),
    },
]

const blocked: EmailBlockDto[] = [
    {
        emailBlockId: 7,
        emailAddress: 'j.smith@gmial.com',
        blockCount: 3,
        blockedUntil: new Date('2026-10-21T00:00:00.000Z'),
    },
]

afterEach(() => {
    focusManager.setFocused(undefined)
    vi.restoreAllMocks()
    notifications.dismiss()
    document.body.innerHTML = ''
})

describe('BounceListView', () => {
    it('lists bounces with type, status and counts on the tabs', async () => {
        route.name = RouteNames.BOUNCE_LIST
        vi.spyOn(BounceApi, 'getBounces').mockResolvedValue({ items: bounces, total: 312 })
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue(blocked)
        const wrapper = mountInApp(BounceListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('j.smith@gmial.com'))
        expect(wrapper.text()).toContain('Permanent')
        expect(wrapper.text()).toContain('Transient')
        expect(wrapper.text()).toContain('—')
        expect(wrapper.text()).toContain('312 bounces')
        expect(wrapper.text()).toContain('1–25 of 312')
    })

    it('asks the server for the selected type', async () => {
        route.name = RouteNames.BOUNCE_LIST
        const getBounces = vi.spyOn(BounceApi, 'getBounces').mockResolvedValue({ items: bounces, total: 2 })
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue([])
        const wrapper = mountInApp(BounceListView)
        await vi.waitFor(() => expect(wrapper.text()).toContain('j.smith@gmial.com'))

        await wrapper
            .findAll('.filter-chip')
            .find((chip) => chip.text() === 'Permanent')!
            .trigger('click')

        await vi.waitFor(() =>
            expect(getBounces).toHaveBeenCalledWith({ query: expect.objectContaining({ type: 'permanent', page: 1 }) }),
        )
    })

    it('treats an empty list as good news', async () => {
        route.name = RouteNames.BOUNCE_LIST
        vi.spyOn(BounceApi, 'getBounces').mockResolvedValue({ items: [], total: 0 })
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue([])
        const wrapper = mountInApp(BounceListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain('Every message so far was accepted'))
    })

    it('shows a load error instead of an empty list', async () => {
        route.name = RouteNames.BOUNCE_LIST
        vi.spyOn(BounceApi, 'getBounces').mockRejectedValue(new Error('offline'))
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue([])
        const wrapper = mountInApp(BounceListView)

        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't load bounces"))
        expect(wrapper.text()).not.toContain('No bounces')
    })

    it('shows progress on retry after a background refresh fails', async () => {
        route.name = RouteNames.BOUNCE_LIST
        let phase: 'loaded' | 'offline' | 'retrying' = 'loaded'
        vi.spyOn(BounceApi, 'getBounces').mockImplementation(() => {
            if (phase === 'loaded') {
                return Promise.resolve({ items: bounces, total: 2 })
            }
            return phase === 'offline' ? Promise.reject(new Error('offline')) : new Promise(() => {})
        })
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue([])
        const wrapper = mountInApp(BounceListView)
        await vi.waitFor(() => expect(wrapper.text()).toContain('j.smith@gmial.com'))

        phase = 'offline'
        focusManager.setFocused(false)
        focusManager.setFocused(true)
        await vi.waitFor(() => expect(wrapper.text()).toContain("Couldn't load bounces"))
        expect(wrapper.get('.state-panel .v-btn').classes()).not.toContain('v-btn--loading')

        phase = 'retrying'
        await findButton(wrapper, 'Try again')!.trigger('click')

        await vi.waitFor(() => expect(wrapper.get('.state-panel .v-btn').classes()).toContain('v-btn--loading'))
    })

    it('unblocks an address after the undo window', async () => {
        route.name = RouteNames.BOUNCE_BLOCKED
        vi.spyOn(BounceApi, 'getBounces').mockResolvedValue({ items: [], total: 0 })
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue(blocked)
        const unblock = vi.spyOn(BounceApi, 'unblock').mockResolvedValue(blocked[0])
        const wrapper = mountInApp(BounceListView)
        await vi.waitFor(() => expect(wrapper.text()).toContain('3'))

        await findButton(wrapper, 'Unblock')!.trigger('click')

        expect(notifications.current.value?.text).toBe('Unblocked j.smith@gmial.com')
        expect(unblock).not.toHaveBeenCalled()
        notifications.dismiss()
        await vi.waitFor(() => expect(unblock).toHaveBeenCalledWith({ path: { emailBlockId: 7 } }))
    })

    it('hides unblocking without the permission', async () => {
        route.name = RouteNames.BOUNCE_BLOCKED
        vi.spyOn(BounceApi, 'getBounces').mockResolvedValue({ items: [], total: 0 })
        vi.spyOn(BounceApi, 'getBlockedAddresses').mockResolvedValue(blocked)
        const wrapper = mountInApp(BounceListView, {}, [{ action: 'read', subject: 'Bounce' }])

        await vi.waitFor(() => expect(wrapper.text()).toContain('j.smith@gmial.com'))
        expect(findButton(wrapper, 'Unblock')).toBeUndefined()
    })
})
