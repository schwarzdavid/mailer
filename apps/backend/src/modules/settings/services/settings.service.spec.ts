import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { ConflictException, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { resolve4, resolve6 } from 'node:dns/promises'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SettingsService } from './settings.service.js'
import { SENDING_DOMAIN_LOCK_KEY } from '../settings.constants.js'
import { SettingsModel } from '../models/settings.model.js'
import { Settings, SettingsCreate } from '../interfaces/settings.interface.js'
import { DomainService } from '../../domain/services/domain.service.js'
import { DomainDnsService } from '../../domain/services/domain-dns.service.js'
import { Domain } from '../../domain/interfaces/domain.interface.js'
import {
    DomainDnsRecord,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../../domain/interfaces/domain-dns.interface.js'

vi.mock('node:dns/promises', () => ({
    resolve4: vi.fn(),
    resolve6: vi.fn(),
}))

const resolveA = vi.mocked(resolve4)
const resolveAaaa = vi.mocked(resolve6)

const MAIL_HOSTNAME = 'mail.sending-domain.org'

type SettingsRow = Settings & { get(options: { plain: true }): Settings; save: Mock<() => Promise<void>> }

const settingsRow = (base: Settings): SettingsRow => ({
    ...base,
    get: () => ({ ...base }),
    save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
})

describe('SettingsService', () => {
    let service: SettingsService
    let query: Mock<Sequelize['query']>
    let transaction: Mock<Sequelize['transaction']>
    let findOne: Mock<() => Promise<SettingsRow | null>>
    let create: Mock<(values: SettingsCreate, options: { returning: true }) => Promise<SettingsRow>>
    let getDomainById: Mock<DomainService['getDomainById']>
    let getDomainByFqdn: Mock<DomainService['getDomainByFqdn']>
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
            host: MAIL_HOSTNAME,
            value: 'v=spf1 ip4:203.0.113.10 -all',
            current: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
    ]

    const sendingDomain: Domain = {
        domainId: 10,
        fqdn: MAIL_HOSTNAME,
        rootDomain: 'sending-domain.org',
        activeDkimId: 77,
        dnsRecords: records,
        lastCheckedAt: null,
    }

    const staleDomain: Domain = { ...sendingDomain, fqdn: 'mail.old-sending.org', rootDomain: 'old-sending.org' }

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
        setupFinishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    const expectLockTaken = () => {
        expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(:key)', {
            replacements: { key: SENDING_DOMAIN_LOCK_KEY },
            transaction: transactionStub,
        })
    }

    const transactionStub = {} as Transaction

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        query = vi.fn<typeof query>().mockResolvedValue([[], 0])
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation((callback) => (callback as (t: Transaction) => Promise<unknown>)(transactionStub))
        findOne = vi.fn<typeof findOne>().mockResolvedValue(null)
        create = vi
            .fn<typeof create>()
            .mockImplementation((values) => Promise.resolve(settingsRow({ ...settings, ...values })))
        getDomainById = vi.fn<typeof getDomainById>().mockResolvedValue(sendingDomain)
        getDomainByFqdn = vi.fn<typeof getDomainByFqdn>().mockResolvedValue(null)
        createSendingDomain = vi.fn<typeof createSendingDomain>().mockResolvedValue(sendingDomain)
        recreateSendingDomainRecords = vi.fn<typeof recreateSendingDomainRecords>().mockResolvedValue(sendingDomain)
        deleteDomain = vi.fn<typeof deleteDomain>().mockResolvedValue(undefined)
        regenerateCustomerSpfRecords = vi.fn<typeof regenerateCustomerSpfRecords>().mockResolvedValue(undefined)
        reloadDnsRecords = vi.fn<typeof reloadDnsRecords>().mockResolvedValue(reloadedDomain)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SettingsService,
                { provide: Sequelize, useValue: { transaction, query } },
                { provide: ConfigService, useValue: { get: () => MAIL_HOSTNAME } },
                {
                    provide: DomainService,
                    useValue: {
                        getDomainById,
                        getDomainByFqdn,
                        createSendingDomain,
                        recreateSendingDomainRecords,
                        deleteDomain,
                    },
                },
                { provide: DomainDnsService, useValue: { regenerateCustomerSpfRecords, reloadDnsRecords } },
                { provide: getModelToken(SettingsModel), useValue: { findOne, create } },
            ],
        }).compile()

        service = module.get(SettingsService)
    })

    afterEach(() => {
        vi.restoreAllMocks()
        resolveA.mockReset()
        resolveAaaa.mockReset()
    })

    describe('getSettings', () => {
        it('returns null when no settings row exists', async () => {
            await expect(service.getSettings()).resolves.toBeNull()
        })

        it('returns the settings row as a plain object', async () => {
            findOne.mockResolvedValue(settingsRow(settings))

            await expect(service.getSettings()).resolves.toEqual(settings)
        })
    })

    describe('finishSetup', () => {
        it('rejects finishing before any settings exist', async () => {
            await expect(service.finishSetup()).rejects.toThrow(
                new ConflictException('Configure a sending domain before finishing the setup.'),
            )
        })

        it('rejects finishing while no sending domain is configured', async () => {
            const row = settingsRow({ ...settings, sendingDomainId: null })
            findOne.mockResolvedValue(row)

            await expect(service.finishSetup()).rejects.toBeInstanceOf(ConflictException)
            expect(row.save).not.toHaveBeenCalled()
        })

        it('stamps the finish time once a sending domain exists', async () => {
            const row = settingsRow(settings)
            findOne.mockResolvedValue(row)

            await service.finishSetup()

            expect(row.setupFinishedAt).toBeInstanceOf(Date)
            expect(row.save).toHaveBeenCalledOnce()
        })

        it('keeps the original finish time when called again', async () => {
            const finishedAt = new Date('2026-07-01T00:00:00.000Z')
            const row = settingsRow({ ...settings, setupFinishedAt: finishedAt })
            findOne.mockResolvedValue(row)

            await service.finishSetup()

            expect(row.setupFinishedAt).toBe(finishedAt)
            expect(row.save).not.toHaveBeenCalled()
        })
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
                fqdn: MAIL_HOSTNAME,
                serverIpv4: '203.0.113.10',
                serverIpv6: null,
                lastCheckedAt: null,
                records,
            })
        })
    })

    describe('getSendingDomainProposal', () => {
        it('proposes MAIL_HOSTNAME with the first addresses it resolves to', async () => {
            resolveA.mockResolvedValue(['203.0.113.10', '203.0.113.11'])
            resolveAaaa.mockResolvedValue(['2001:db8::10'])

            await expect(service.getSendingDomainProposal()).resolves.toEqual({
                fqdn: MAIL_HOSTNAME,
                serverIpv4: '203.0.113.10',
                serverIpv6: '2001:db8::10',
            })
            expect(resolveA).toHaveBeenCalledWith(MAIL_HOSTNAME)
            expect(resolveAaaa).toHaveBeenCalledWith(MAIL_HOSTNAME)
        })

        it('leaves the addresses empty when the records do not exist', async () => {
            resolveA.mockRejectedValue(Object.assign(new Error('queryA ENOTFOUND'), { code: 'ENOTFOUND' }))
            resolveAaaa.mockRejectedValue(Object.assign(new Error('queryAaaa ENODATA'), { code: 'ENODATA' }))

            await expect(service.getSendingDomainProposal()).resolves.toEqual({
                fqdn: MAIL_HOSTNAME,
                serverIpv4: null,
                serverIpv6: null,
            })
        })

        it('keeps the IPv4 address when only the IPv6 lookup fails', async () => {
            resolveA.mockResolvedValue(['203.0.113.10'])
            resolveAaaa.mockRejectedValue(new Error('queryAaaa ETIMEOUT'))

            await expect(service.getSendingDomainProposal()).resolves.toEqual({
                fqdn: MAIL_HOSTNAME,
                serverIpv4: '203.0.113.10',
                serverIpv6: null,
            })
        })
    })

    describe('configureSendingDomain', () => {
        const ips = { serverIpv4: '203.0.113.10', serverIpv6: null }

        it('takes the sending domain lock before changing anything', async () => {
            await service.configureSendingDomain(ips)

            expectLockTaken()
            expect(query.mock.invocationCallOrder[0]).toBeLessThan(createSendingDomain.mock.invocationCallOrder[0]!)
        })

        it('creates the MAIL_HOSTNAME domain and the settings row on first configuration', async () => {
            const result = await service.configureSendingDomain(ips)

            expect(createSendingDomain).toHaveBeenCalledWith(MAIL_HOSTNAME, {
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

        it('recreates the record set when the stored domain matches MAIL_HOSTNAME', async () => {
            const row = settingsRow(settings)
            findOne.mockResolvedValue(row)

            await service.configureSendingDomain({ ...ips, serverIpv6: '2001:db8::1' })

            expect(recreateSendingDomainRecords).toHaveBeenCalledWith(MAIL_HOSTNAME, {
                serverIpv4: '203.0.113.10',
                serverIpv6: '2001:db8::1',
            })
            expect(createSendingDomain).not.toHaveBeenCalled()
            expect(deleteDomain).not.toHaveBeenCalled()
            expect(row.serverIpv6).toBe('2001:db8::1')
            expect(row.save).toHaveBeenCalledOnce()
        })

        it('replaces a stored domain that differs from MAIL_HOSTNAME', async () => {
            const row = settingsRow(settings)
            findOne.mockResolvedValue(row)
            getDomainById.mockResolvedValue(staleDomain)
            const newDomain: Domain = { ...sendingDomain, domainId: 11 }
            createSendingDomain.mockResolvedValue(newDomain)
            reloadDnsRecords.mockResolvedValue(newDomain)

            await service.configureSendingDomain(ips)

            expect(createSendingDomain).toHaveBeenCalledWith(MAIL_HOSTNAME, {
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

            const result = await service.configureSendingDomain(ips)

            expect(result.records).toEqual(records)
        })
    })

    describe('reconcileSendingDomain', () => {
        it('runs on application bootstrap', async () => {
            findOne.mockResolvedValue(settingsRow(settings))
            getDomainById.mockResolvedValue(staleDomain)

            await service.onApplicationBootstrap()

            expectLockTaken()
            expect(createSendingDomain).toHaveBeenCalledWith(MAIL_HOSTNAME, expect.anything())
        })

        it('does nothing before a sending domain is configured', async () => {
            await service.reconcileSendingDomain()

            expect(getDomainById).not.toHaveBeenCalled()
            expect(createSendingDomain).not.toHaveBeenCalled()
            expect(create).not.toHaveBeenCalled()
        })

        it('leaves a sending domain that matches MAIL_HOSTNAME untouched', async () => {
            findOne.mockResolvedValue(settingsRow(settings))

            await service.reconcileSendingDomain()

            expect(createSendingDomain).not.toHaveBeenCalled()
            expect(recreateSendingDomainRecords).not.toHaveBeenCalled()
            expect(deleteDomain).not.toHaveBeenCalled()
            expect(regenerateCustomerSpfRecords).not.toHaveBeenCalled()
        })

        it('switches a stale sending domain to MAIL_HOSTNAME with the stored addresses', async () => {
            const row = settingsRow({ ...settings, serverIpv6: '2001:db8::10' })
            findOne.mockResolvedValue(row)
            getDomainById.mockResolvedValue(staleDomain)
            const newDomain: Domain = { ...sendingDomain, domainId: 11 }
            createSendingDomain.mockResolvedValue(newDomain)

            await service.reconcileSendingDomain()

            expect(deleteDomain).toHaveBeenCalledWith(10)
            expect(createSendingDomain).toHaveBeenCalledWith(MAIL_HOSTNAME, {
                serverIpv4: '203.0.113.10',
                serverIpv6: '2001:db8::10',
            })
            expect(row.sendingDomainId).toBe(11)
            expect(regenerateCustomerSpfRecords).toHaveBeenCalledWith(newDomain)
        })

        it('refuses to switch when MAIL_HOSTNAME is registered as a customer domain', async () => {
            findOne.mockResolvedValue(settingsRow(settings))
            getDomainById.mockResolvedValue(staleDomain)
            getDomainByFqdn.mockResolvedValue({ ...sendingDomain, domainId: 12 })

            await expect(service.reconcileSendingDomain()).rejects.toThrow(/registered as a customer domain/)
            expect(getDomainByFqdn).toHaveBeenCalledWith(MAIL_HOSTNAME)
            expect(deleteDomain).not.toHaveBeenCalled()
            expect(createSendingDomain).not.toHaveBeenCalled()
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
