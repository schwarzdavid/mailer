import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { QueryClient } from '@tanstack/vue-query'
import { DomainApi, type DomainDnsRecordDto, type DomainDetailDto } from 'api'
import { useDomainQuery } from '../useDomainQuery.ts'

const record: DomainDnsRecordDto = {
    current: null,
    host: 'mail.example.org',
    status: 'valid',
    type: 'txt',
    use: 'spf',
    value: 'v=spf1 include:sending-domain.org -all',
}

const domain: DomainDetailDto = {
    domainId: 5,
    fqdn: 'mail.example.org',
    rootDomain: 'example.org',
    dns: { spf: record, dkim: record, dmarc: record },
    lastCheckedAt: null,
    projects: [],
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('useDomainQuery', () => {
    it('fetches the domain by id', async () => {
        const getDomain = vi.spyOn(DomainApi, 'getDomain').mockResolvedValue(domain)

        await expect(new QueryClient().fetchQuery(useDomainQuery(5))).resolves.toEqual(domain)
        expect(getDomain).toHaveBeenCalledWith({ path: { domainId: 5 } })
    })

    it('reads the current value of a reactive id', async () => {
        const getDomain = vi.spyOn(DomainApi, 'getDomain').mockResolvedValue(domain)
        const domainId = ref(5)
        const options = useDomainQuery(domainId)
        domainId.value = 9

        await new QueryClient().fetchQuery(options)

        expect(getDomain).toHaveBeenCalledWith({ path: { domainId: 9 } })
    })

    it('is keyed beneath the domains list key', () => {
        expect(useDomainQuery(5).queryKey).toEqual(['domains', 5])
    })
})
