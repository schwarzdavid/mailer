import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SettingsController } from './settings.controller.js'
import { SettingsService } from '../services/settings.service.js'
import { PoliciesGuard } from '../../permission/guards/policies.guard.js'
import { SendingDomain, SendingDomainProposal } from '../interfaces/settings.interface.js'
import { SettingsDto } from '../dtos/settings.dto.js'
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
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ],
}

const proposal: SendingDomainProposal = {
    fqdn: 'mail.sending-domain.org',
    serverIpv4: '203.0.113.10',
    serverIpv6: null,
}

describe('SettingsController', () => {
    let controller: SettingsController
    let getSendingDomain: Mock<SettingsService['getSendingDomain']>
    let getSendingDomainProposal: Mock<SettingsService['getSendingDomainProposal']>
    let configureSendingDomain: Mock<SettingsService['configureSendingDomain']>
    let refreshSendingDomain: Mock<SettingsService['refreshSendingDomain']>

    beforeEach(async () => {
        getSendingDomain = vi.fn<typeof getSendingDomain>().mockResolvedValue(sendingDomain)
        getSendingDomainProposal = vi.fn<typeof getSendingDomainProposal>().mockResolvedValue(proposal)
        configureSendingDomain = vi.fn<typeof configureSendingDomain>().mockResolvedValue(sendingDomain)
        refreshSendingDomain = vi.fn<typeof refreshSendingDomain>().mockResolvedValue(sendingDomain)

        const module: TestingModule = await Test.createTestingModule({
            controllers: [SettingsController],
            providers: [
                {
                    provide: SettingsService,
                    useValue: {
                        getSendingDomain,
                        getSendingDomainProposal,
                        configureSendingDomain,
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
        it('wraps the configured sending domain', async () => {
            await expect(controller.getSettings()).resolves.toEqual({ sendingDomain })
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

            expect(serialized).toEqual({
                sendingDomain: {
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
                        },
                    ],
                },
            })
        })
    })

    describe('getSendingDomainProposal', () => {
        it('returns the proposal from the service', async () => {
            await expect(controller.getSendingDomainProposal()).resolves.toBe(proposal)
        })
    })

    describe('configureSendingDomain', () => {
        it('passes the server addresses through to the service', async () => {
            const result = await controller.configureSendingDomain({
                serverIpv4: '203.0.113.10',
                serverIpv6: '2001:db8::10',
            })

            expect(configureSendingDomain).toHaveBeenCalledWith({
                serverIpv4: '203.0.113.10',
                serverIpv6: '2001:db8::10',
            })
            expect(result).toBe(sendingDomain)
        })

        it('normalizes an omitted IPv6 address to null', async () => {
            await controller.configureSendingDomain({ serverIpv4: '203.0.113.10' })

            expect(configureSendingDomain).toHaveBeenCalledWith({
                serverIpv4: '203.0.113.10',
                serverIpv6: null,
            })
        })
    })

    describe('refreshSendingDomain', () => {
        it('returns the refreshed sending domain', async () => {
            await expect(controller.refreshSendingDomain()).resolves.toBe(sendingDomain)
            expect(refreshSendingDomain).toHaveBeenCalledOnce()
        })

        it('propagates the not-found error when no sending domain is configured', async () => {
            refreshSendingDomain.mockRejectedValue(new NotFoundException('No sending domain configured.'))

            await expect(controller.refreshSendingDomain()).rejects.toThrow(NotFoundException)
        })
    })
})
