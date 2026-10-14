import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/vue-query'
import { SettingsApi, type SettingsDto } from 'api'
import { useSettingsQuery } from '../useSettingsQuery.ts'

const settings: SettingsDto = { sendingDomain: null }

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useSettingsQuery', () => {
    it('loads the settings under the key the sending domain mutations write to', async () => {
        const getSettings = vi.spyOn(SettingsApi, 'getSettings').mockResolvedValue(settings)
        const options = useSettingsQuery()

        await expect(new QueryClient().fetchQuery(options)).resolves.toEqual(settings)
        expect(options.queryKey).toEqual(['settings'])
        expect(getSettings).toHaveBeenCalledTimes(1)
    })
})
