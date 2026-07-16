import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { Logger, NotFoundException } from '@nestjs/common'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SettingsService } from './settings.service'
import { SettingsModel } from '../models/settings.model'
import { Settings, SettingsCreate } from '../interfaces/settings.interface'
import { DomainService } from '../../domain/services/domain.service'
import { DomainDnsService } from '../../domain/services/domain-dns.service'
import { Domain } from '../../domain/interfaces/domain.interface'
import {
    DomainDnsRecord,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../../domain/interfaces/domain-dns.interface'

type SettingsRow = Settings & { save: Mock<() => Promise<void>> }

const settingsRow = (base: Settings): SettingsRow => ({
    ...base,
    save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
})

describe('SettingsService', () => {
    let service: SettingsService
    let findOne: Mock<() => Promise<SettingsRow | null>>
    let create: Mock<(values: SettingsCreate, options: { returning: true }) => Promise<SettingsRow>>
    let getDomainById: Mock<DomainService['getDomainById']>
    let createSendingDomain: Mock<DomainService['createSendingDomain']>
    let recreateSendingDomainRecords: Mock<DomainService['recreateSendingDomainRecords']>
    let deleteDomain: Mock<DomainService['deleteDomain']>
    let regenerateCustomerSpfRecords: Mock<DomainDnsService['regenerateCustomerSpfRecords']>
    let reloadDnsRecords: Mock<DomainDnsService['reloadDnsRecords']>

    const records: DomainDnsRecord[] = [
        {
            dnsId: 1,
            domainId: 10,
            type: DomainDnsRecordType.TXT,
            use: DomainDnsRecordUse.SPF,
            status: DomainDnsRecordStatus.INVALID,
            host: 'mail.sending-domain.org',
            value: 'v=spf1 ip4:203.0.113.10 -all',
            current: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ]

    const sendingDomain: Domain = {
        domainId: 10,
        fqdn: 'mail.sending-domain.org',
        rootDomain: 'sending-domain.org',
        activeDkimId: 77,
        dnsRecords: records,
        lastCheckedAt: null,
    }

    const reloadedDomain: Domain = {
        ...sendingDomain,
        lastCheckedAt: new Date(),
        dnsRecords: [{ ...records[0]!, status: DomainDnsRecordStatus.VALID }],
    }

    const settings: Settings = {
        settingId: 1,
        sendingDomainId: 10,
        serverIpv4: '203.0.113.10',
        serverIpv6: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        findOne = vi.fn<typeof findOne>().mockResolvedValue(null)
        create = vi
            .fn<typeof create>()
            .mockImplementation((values) => Promise.resolve(settingsRow({ ...settings, ...values })))
        getDomainById = vi.fn<typeof getDomainById>().mockResolvedValue(sendingDomain)
        createSendingDomain = vi.fn<typeof createSendingDomain>().mockResolvedValue(sendingDomain)
        recreateSendingDomainRecords = vi.fn<typeof recreateSendingDomainRecords>().mockResolvedValue(sendingDomain)
        deleteDomain = vi.fn<typeof deleteDomain>().mockResolvedValue(undefined)
        regenerateCustomerSpfRecords = vi.fn<typeof regenerateCustomerSpfRecords>().mockResolvedValue(undefined)
        reloadDnsRecords = vi.fn<typeof reloadDnsRecords>().mockResolvedValue(reloadedDomain)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SettingsService,
                {
                    provide: DomainService,
                    useValue: { getDomainById, createSendingDomain, recreateSendingDomainRecords, deleteDomain },
                },
                { provide: DomainDnsService, useValue: { regenerateCustomerSpfRecords, reloadDnsRecords } },
                { provide: getModelToken(SettingsModel), useValue: { findOne, create } },
            ],
        }).compile()

        service = module.get(SettingsService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('getSendingDomain', () => {
        it('returns null when no settings row exists', async () => {
            await expect(service.getSendingDomain()).resolves.toBeNull()
        })

        it('maps the configured domain and settings into a sending domain', async () => {
            findOne.mockResolvedValue(settingsRow(settings))

            const result = await service.getSendingDomain()

            expect(getDomainById).toHaveBeenCalledWith(10)
            expect(result).toEqual({
                fqdn: 'mail.sending-domain.org',
                serverIpv4: '203.0.113.10',
                serverIpv6: null,
                lastCheckedAt: null,
                records,
            })
        })
    })

    describe('configureSendingDomain', () => {
        const config = { fqdn: 'mail.sending-domain.org', serverIpv4: '203.0.113.10', serverIpv6: null }

        it('creates the domain and the settings row on first configuration', async () => {
            const result = await service.configureSendingDomain(config)

            expect(createSendingDomain).toHaveBeenCalledWith('mail.sending-domain.org', {
                serverIpv4: '203.0.113.10',
                serverIpv6: null,
            })
            expect(create).toHaveBeenCalledWith(
                { sendingDomainId: 10, serverIpv4: '203.0.113.10', serverIpv6: null },
                { returning: true },
            )
            expect(regenerateCustomerSpfRecords).toHaveBeenCalledWith(sendingDomain)
            expect(reloadDnsRecords).toHaveBeenCalledWith(10)
            expect(result.records).toEqual(reloadedDomain.dnsRecords)
        })

        it('recreates the record set when the fqdn is unchanged', async () => {
            const row = settingsRow(settings)
            findOne.mockResolvedValue(row)

            await service.configureSendingDomain({ ...config, serverIpv6: '2001:db8::1' })

            expect(recreateSendingDomainRecords).toHaveBeenCalledWith('mail.sending-domain.org', {
                serverIpv4: '203.0.113.10',
                serverIpv6: '2001:db8::1',
            })
            expect(createSendingDomain).not.toHaveBeenCalled()
            expect(deleteDomain).not.toHaveBeenCalled()
            expect(row.serverIpv6).toBe('2001:db8::1')
            expect(row.save).toHaveBeenCalledOnce()
        })

        it('creates a new domain and deletes the old one when the fqdn changes', async () => {
            const row = settingsRow(settings)
            findOne.mockResolvedValue(row)
            const newDomain: Domain = { ...sendingDomain, domainId: 11, fqdn: 'mail.other-sending.org' }
            createSendingDomain.mockResolvedValue(newDomain)
            reloadDnsRecords.mockResolvedValue(newDomain)

            await service.configureSendingDomain({ ...config, fqdn: 'mail.other-sending.org' })

            expect(createSendingDomain).toHaveBeenCalledWith('mail.other-sending.org', {
                serverIpv4: '203.0.113.10',
                serverIpv6: null,
            })
            expect(row.sendingDomainId).toBe(11)
            expect(row.save).toHaveBeenCalledOnce()
            expect(deleteDomain).toHaveBeenCalledWith(10)
            expect(deleteDomain.mock.invocationCallOrder[0]).toBeLessThan(
                createSendingDomain.mock.invocationCallOrder[0]!,
            )
        })

        it('returns the unrefreshed records when the initial dns check fails', async () => {
            reloadDnsRecords.mockRejectedValue(new Error('resolver down'))

            const result = await service.configureSendingDomain(config)

            expect(result.records).toEqual(records)
        })
    })

    describe('refreshSendingDomain', () => {
        it('throws when nothing is configured', async () => {
            await expect(service.refreshSendingDomain()).rejects.toBeInstanceOf(NotFoundException)
        })

        it('reloads the records and maps the result', async () => {
            findOne.mockResolvedValue(settingsRow(settings))

            const result = await service.refreshSendingDomain()

            expect(reloadDnsRecords).toHaveBeenCalledWith(10)
            expect(result.records).toEqual(reloadedDomain.dnsRecords)
            expect(result.lastCheckedAt).toBe(reloadedDomain.lastCheckedAt)
        })
    })
})
