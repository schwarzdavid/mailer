import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiKeyApi } from 'api'
import ProjectApiKeysCard from '../partials/ProjectApiKeysCard.vue'
import {
    findButton,
    mountInApp,
    overlayButton,
    overlayText,
    setOverlayInput,
    submitOverlayForm,
} from '@/__tests__/support.ts'
import { apiKey, apiKeyCreated, projectDetail } from '@/__tests__/fixtures.ts'
import { useNotificationHost } from '@/composables/useNotify.ts'

vi.mock('@/helper/waitAtleast.ts', () => ({
    waitAtleast: <T>(promise: Promise<T>) => promise,
}))
vi.stubGlobal('visualViewport', null)

const notifications = useNotificationHost()

afterEach(() => {
    vi.restoreAllMocks()
    notifications.dismiss()
    document.body.innerHTML = ''
})

describe('ProjectApiKeysCard', () => {
    it('lists active keys before revoked ones with their prefix and usage', async () => {
        vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue([
            apiKey({
                apiKeyId: 12,
                name: 'Old shop',
                prefix: 'sdm_OLDOLDOL',
                revokedAt: new Date('2026-10-02T10:00:00Z'),
            }),
            apiKey({ apiKeyId: 11, name: 'Newsletter', lastUsedAt: null }),
        ])
        const wrapper = mountInApp(ProjectApiKeysCard, { project: projectDetail(), canUpdate: true })

        await vi.waitFor(() => expect(wrapper.text()).toContain('Newsletter'))
        const text = wrapper.text()
        expect(text.indexOf('Newsletter')).toBeLessThan(text.indexOf('Old shop'))
        expect(text).toContain('sdm_a1B2c3D4')
        expect(text).toContain('Never used')
        expect(text).toContain('Revoked')
        expect(wrapper.find('button[aria-label="Revoke Old shop"]').exists()).toBe(false)
    })

    it('hides create and revoke for read-only members', async () => {
        vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue([apiKey()])
        const wrapper = mountInApp(ProjectApiKeysCard, { project: projectDetail(), canUpdate: false })

        await vi.waitFor(() => expect(wrapper.text()).toContain('Newsletter'))
        expect(findButton(wrapper, 'New API key')).toBeUndefined()
        expect(wrapper.find('button[aria-label="Revoke Newsletter"]').exists()).toBe(false)
    })

    it('revokes a key after confirmation', async () => {
        vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue([apiKey()])
        const revokeSpy = vi.spyOn(ApiKeyApi, 'revokeApiKey').mockResolvedValue(undefined)
        const wrapper = mountInApp(ProjectApiKeysCard, { project: projectDetail(), canUpdate: true })
        await vi.waitFor(() => expect(wrapper.text()).toContain('Newsletter'))

        await wrapper.get('button[aria-label="Revoke Newsletter"]').trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Revoke “Newsletter”?'))
        overlayButton('Revoke key').click()

        await vi.waitFor(() => expect(revokeSpy).toHaveBeenCalledWith({ path: { projectId: 1, apiKeyId: 11 } }))
        await vi.waitFor(() => expect(notifications.current.value?.text).toBe('“Newsletter” revoked'))
    })

    it('keeps the key when revoking is cancelled', async () => {
        vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue([apiKey()])
        const revokeSpy = vi.spyOn(ApiKeyApi, 'revokeApiKey').mockResolvedValue(undefined)
        const wrapper = mountInApp(ProjectApiKeysCard, { project: projectDetail(), canUpdate: true })
        await vi.waitFor(() => expect(wrapper.text()).toContain('Newsletter'))

        await wrapper.get('button[aria-label="Revoke Newsletter"]').trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Revoke “Newsletter”?'))
        overlayButton('Cancel').click()

        await vi.waitFor(() => expect(document.body.querySelector('.confirm-dialog')).toBeNull())
        expect(revokeSpy).not.toHaveBeenCalled()
    })

    it('creates a key and shows it exactly once', async () => {
        vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue([])
        const created = apiKeyCreated()
        vi.spyOn(ApiKeyApi, 'createApiKey').mockResolvedValue(created)
        const wrapper = mountInApp(ProjectApiKeysCard, { project: projectDetail(), canUpdate: true })
        await vi.waitFor(() => expect(wrapper.text()).toContain('No API keys yet'))

        await findButton(wrapper, 'New API key')!.trigger('click')
        await vi.waitFor(() => expect(overlayText()).toContain('Name the key'))
        await setOverlayInput('name', 'Newsletter')
        submitOverlayForm()

        await vi.waitFor(() => expect(overlayText()).toContain("You won't be able to see it again."))
        expect(overlayText()).toContain(created.key)
        expect(notifications.current.value?.text).toBe('“Newsletter” created')
        overlayButton('Done').click()
        await vi.waitFor(() => expect(overlayText()).not.toContain(created.key))
    })

    it('explains an empty list', async () => {
        vi.spyOn(ApiKeyApi, 'getApiKeys').mockResolvedValue([])
        const wrapper = mountInApp(ProjectApiKeysCard, { project: projectDetail(), canUpdate: false })

        await vi.waitFor(() => expect(wrapper.text()).toContain('No API keys yet'))
        expect(wrapper.text()).toContain('Ask someone with update access to create one.')
    })
})
