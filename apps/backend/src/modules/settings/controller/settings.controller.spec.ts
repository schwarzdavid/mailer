import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SettingsController } from './settings.controller.js'
import { SettingsService } from '../services/settings.service.js'
import { PoliciesGuard } from '../../permission/guards/policies.guard.js'
import { SendingDomain } from '../interfaces/settings.interface.js'
import { SettingsDto } from '../dtos/settings.dto.js'
import { SendingDomainDto } from '../dtos/sending-domain.dto.js'
import {
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../../domain/interfaces/domain-dns.interface.js'

const sendingDomain: SendingDomain = {
    fqdn: 'mail.sending-domain.org',
    serverIpv4: '203.0.113.10',
    serverIpv6: null,
    lastCheckedAt: null,
    records: [
        {
            dnsId: 1,
            domainId: 10,
            type: DomainDnsRecordType.TXT,
            use: DomainDnsRecordUse.SPF,
            status: DomainDnsRecordStatus.VALID,
            host: 'mail.sending-domain.org',
            value: 'v=spf1 ip4:203.0.113.10 -all',
            current: 'v=spf1 ip4:203.0.113.10 -all',
            issue: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        {
            dnsId: 2,
            domainId: 10,
            type: DomainDnsRecordType.MX,
            use: DomainDnsRecordUse.MX,
            status: DomainDnsRecordStatus.VALID,
            host: 'mail.sending-domain.org',
            value: '10 mail.sending-domain.org',
            current: '10 mail.sending-domain.org',
            issue: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ],
}

const serializedSendingDomain = {
    fqdn: 'mail.sending-domain.org',
    serverIpv4: '203.0.113.10',
    serverIpv6: null,
    lastCheckedAt: null,
    records: [
        {
            type: DomainDnsRecordType.TXT,
            use: DomainDnsRecordUse.SPF,
            status: DomainDnsRecordStatus.VALID,
            host: 'mail.sending-domain.org',
            value: 'v=spf1 ip4:203.0.113.10 -all',
            current: 'v=spf1 ip4:203.0.113.10 -all',
            issue: null,
            priority: null,
        },
        {
            type: DomainDnsRecordType.MX,
            use: DomainDnsRecordUse.MX,
            status: DomainDnsRecordStatus.VALID,
            host: 'mail.sending-domain.org',
            value: 'mail.sending-domain.org',
            priority: 10,
            current: '10 mail.sending-domain.org',
            issue: null,
        },
    ],
}

describe('SettingsController', () => {
    let controller: SettingsController
    let getSendingDomain: Mock<SettingsService['getSendingDomain']>
    let refreshSendingDomain: Mock<SettingsService['refreshSendingDomain']>

    beforeEach(async () => {
        getSendingDomain = vi.fn<typeof getSendingDomain>().mockResolvedValue(sendingDomain)
        refreshSendingDomain = vi.fn<typeof refreshSendingDomain>().mockResolvedValue(sendingDomain)

        const module: TestingModule = await Test.createTestingModule({
            controllers: [SettingsController],
            providers: [
                {
                    provide: SettingsService,
                    useValue: {
                        getSendingDomain,
                        refreshSendingDomain,
                    },
                },
            ],
        })
            .overrideGuard(PoliciesGuard)
            .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
            .compile()

        controller = module.get(SettingsController)
    })

    describe('getSettings', () => {
        it('wraps the configured sending domain as its response DTO', async () => {
            const settings = await controller.getSettings()

            expect(settings.sendingDomain).toBeInstanceOf(SendingDomainDto)
            expect(settings.sendingDomain?.fqdn).toBe(sendingDomain.fqdn)
        })

        it('reports a null sending domain before one is configured', async () => {
            getSendingDomain.mockResolvedValue(null)

            await expect(controller.getSettings()).resolves.toEqual({ sendingDomain: null })
        })

        it('serializes the nested sending domain and its records without internal ids', async () => {
            const settings = await controller.getSettings()

            const serialized = instanceToPlain(
                plainToInstance(SettingsDto, settings, { excludeExtraneousValues: true, exposeDefaultValues: true }),
                { excludeExtraneousValues: true },
            )

            expect(serialized).toEqual({ sendingDomain: serializedSendingDomain })
        })
    })

    describe('refreshSendingDomain', () => {
        it('returns the refreshed sending domain as its response DTO', async () => {
            const refreshed = await controller.refreshSendingDomain()

            expect(refreshed).toBeInstanceOf(SendingDomainDto)
            expect(instanceToPlain(refreshed, { excludeExtraneousValues: true })).toEqual(serializedSendingDomain)
            expect(refreshSendingDomain).toHaveBeenCalledOnce()
        })

        it('propagates the not-found error when no sending domain is configured', async () => {
            refreshSendingDomain.mockRejectedValue(new NotFoundException('No sending domain configured.'))

            await expect(controller.refreshSendingDomain()).rejects.toThrow(NotFoundException)
        })
    })
})
