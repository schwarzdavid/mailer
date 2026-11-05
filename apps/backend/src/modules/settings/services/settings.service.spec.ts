import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { ConflictException, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Sequelize } from 'sequelize-typescript'
import type { Transaction } from 'sequelize'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SettingsService } from './settings.service.js'
import { SENDING_DOMAIN_LOCK_KEY } from '../settings.constants.js'
import { SettingsModel } from '../models/settings.model.js'
import { Settings, SettingsCreate } from '../interfaces/settings.interface.js'
import { DomainService } from '../../domain/services/domain.service.js'
import { DomainDnsService } from '../../domain/services/domain-dns.service.js'
import { DnsHealthService } from '../../domain/services/dns-health.service.js'
import type { Env } from '../../../config/env.schema.js'
import { Domain } from '../../domain/interfaces/domain.interface.js'
import {
    DomainDnsRecord,
    DomainDnsRecordIssue,
    DomainDnsRecordStatus,
    DomainDnsRecordType,
    DomainDnsRecordUse,
} from '../../domain/interfaces/domain-dns.interface.js'

const MAIL_HOSTNAME = 'mail.sending-domain.org'
const SERVER_IPV4 = '203.0.113.10'
const SERVER_IPV6 = '2001:db8::10'

type SettingsRow = Settings & { get(options: { plain: true }): Settings; save: Mock<() => Promise<void>> }

const settingsRow = (base: Settings): SettingsRow => ({
    ...base,
    get: () => ({ ...base }),
    save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
})

const dnsRecord = (use: DomainDnsRecordUse, type: DomainDnsRecordType, value: string): DomainDnsRecord => ({
    dnsId: 1,
    domainId: 10,
    type,
    use,
    status: DomainDnsRecordStatus.INVALID,
    host: MAIL_HOSTNAME,
    value,
    current: null,
    issue: DomainDnsRecordIssue.MISSING,
    createdAt: new Date(),
    updatedAt: new Date(),
})

const aRecord = (value: string) => dnsRecord(DomainDnsRecordUse.A, DomainDnsRecordType.A, value)
const aaaaRecord = (value: string) => dnsRecord(DomainDnsRecordUse.AAAA, DomainDnsRecordType.AAAA, value)
const ptrRecord = (address: string) => ({
    ...dnsRecord(DomainDnsRecordUse.PTR, DomainDnsRecordType.PTR, MAIL_HOSTNAME),
    host: address,
})

const fullRecordSet = (serverIpv4: string, serverIpv6?: string): DomainDnsRecord[] => [
    aRecord(serverIpv4),
    dnsRecord(DomainDnsRecordUse.MX, DomainDnsRecordType.MX, `10 ${MAIL_HOSTNAME}`),
    dnsRecord(DomainDnsRecordUse.SPF, DomainDnsRecordType.TXT, `v=spf1 ip4:${serverIpv4} -all`),
    ptrRecord(serverIpv4),
    ...(serverIpv6 ? [aaaaRecord(serverIpv6), ptrRecord(serverIpv6)] : []),
    dnsRecord(DomainDnsRecordUse.DKIM, DomainDnsRecordType.TXT, 'v=DKIM1; k=rsa; p=key'),
    dnsRecord(DomainDnsRecordUse.DMARC, DomainDnsRecordType.TXT, 'v=DMARC1; p=none;'),
]

interface ServiceOptions {
    sendRequireValidDns?: boolean
    serverIpv6?: string
}

describe('SettingsService', () => {
    let service: SettingsService
    let errorSpy: Mock<Logger['error']>
    let warnSpy: Mock<Logger['warn']>
    let query: Mock<Sequelize['query']>
    let transaction: Mock<Sequelize['transaction']>
    let findOne: Mock<() => Promise<SettingsRow | null>>
    let create: Mock<(values: SettingsCreate, options: { returning: true }) => Promise<SettingsRow>>
    let getDomainById: Mock<DomainService['getDomainById']>
    let getDomainByFqdn: Mock<DomainService['getDomainByFqdn']>
    let getDomainByRootDomain: Mock<DomainService['getDomainByRootDomain']>
    let createSendingDomain: Mock<DomainService['createSendingDomain']>
    let recreateSendingDomainRecords: Mock<DomainService['recreateSendingDomainRecords']>
    let deleteDomain: Mock<DomainService['deleteDomain']>
    let regenerateCustomerSpfRecords: Mock<DomainDnsService['regenerateCustomerSpfRecords']>
    let reloadDnsRecords: Mock<DomainDnsService['reloadDnsRecords']>
    let handleCheckInterval: Mock<DnsHealthService['handleCheckInterval']>

    const records: DomainDnsRecord[] = fullRecordSet(SERVER_IPV4)

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
        dnsRecords: records.map((record) => ({ ...record, status: DomainDnsRecordStatus.VALID })),
    }

    const settings: Settings = {
        settingId: 1,
        sendingDomainId: 10,
        setupFinishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }

    const transactionStub = {} as Transaction

    const expectLockTaken = () => {
        expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(:key)', {
            replacements: { key: SENDING_DOMAIN_LOCK_KEY },
            transaction: transactionStub,
        })
    }

    const expectNothingWritten = () => {
        expect(createSendingDomain).not.toHaveBeenCalled()
        expect(recreateSendingDomainRecords).not.toHaveBeenCalled()
        expect(deleteDomain).not.toHaveBeenCalled()
        expect(regenerateCustomerSpfRecords).not.toHaveBeenCalled()
        expect(create).not.toHaveBeenCalled()
    }

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

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
        getDomainByRootDomain = vi.fn<typeof getDomainByRootDomain>().mockResolvedValue(null)
        createSendingDomain = vi.fn<typeof createSendingDomain>().mockResolvedValue(sendingDomain)
        recreateSendingDomainRecords = vi.fn<typeof recreateSendingDomainRecords>().mockResolvedValue(sendingDomain)
        deleteDomain = vi.fn<typeof deleteDomain>().mockResolvedValue(undefined)
        regenerateCustomerSpfRecords = vi.fn<typeof regenerateCustomerSpfRecords>().mockResolvedValue(undefined)
        reloadDnsRecords = vi.fn<typeof reloadDnsRecords>().mockResolvedValue(reloadedDomain)
        handleCheckInterval = vi.fn<typeof handleCheckInterval>().mockResolvedValue(undefined)

        service = await createService()
    })

    async function createService(options: ServiceOptions = {}): Promise<SettingsService> {
        const config: Pick<Env, 'MAIL_HOSTNAME' | 'MAIL_SERVER_IPV4' | 'MAIL_SERVER_IPV6' | 'SEND_REQUIRE_VALID_DNS'> =
            {
                MAIL_HOSTNAME,
                MAIL_SERVER_IPV4: SERVER_IPV4,
                MAIL_SERVER_IPV6: options.serverIpv6,
                SEND_REQUIRE_VALID_DNS: options.sendRequireValidDns ?? false,
            }
        const configGet = vi
            .fn<(key: keyof typeof config) => string | boolean | undefined>()
            .mockImplementation((key) => config[key])

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SettingsService,
                { provide: Sequelize, useValue: { transaction, query } },
                { provide: ConfigService, useValue: { get: configGet } },
                { provide: DnsHealthService, useValue: { handleCheckInterval } },
                {
                    provide: DomainService,
                    useValue: {
                        getDomainById,
                        getDomainByFqdn,
                        getDomainByRootDomain,
                        createSendingDomain,
                        recreateSendingDomainRecords,
                        deleteDomain,
                    },
                },
                { provide: DomainDnsService, useValue: { regenerateCustomerSpfRecords, reloadDnsRecords } },
                { provide: getModelToken(SettingsModel), useValue: { findOne, create } },
            ],
        }).compile()

        return module.get(SettingsService)
    }

    afterEach(() => {
        vi.restoreAllMocks()
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

        it('maps the configured domain and the configured addresses into a sending domain', async () => {
            findOne.mockResolvedValue(settingsRow(settings))

            const result = await service.getSendingDomain()

            expect(getDomainById).toHaveBeenCalledWith(10)
            expect(result).toEqual({
                fqdn: MAIL_HOSTNAME,
                serverIpv4: SERVER_IPV4,
                serverIpv6: null,
                lastCheckedAt: null,
                records,
            })
        })

        it('reports the configured addresses even when the records still carry other ones', async () => {
            service = await createService({ serverIpv6: SERVER_IPV6 })
            findOne.mockResolvedValue(settingsRow(settings))
            getDomainById.mockResolvedValue({ ...sendingDomain, dnsRecords: [aRecord('203.0.113.99')] })

            const result = await service.getSendingDomain()

            expect(result).toMatchObject({ serverIpv4: SERVER_IPV4, serverIpv6: SERVER_IPV6 })
        })
    })

    describe('onApplicationBootstrap', () => {
        it('starts the dns check only after the sending domain was reconciled while SEND_REQUIRE_VALID_DNS is on', async () => {
            service = await createService({ sendRequireValidDns: true })
            findOne.mockResolvedValue(settingsRow(settings))
            let finishLookup!: (domain: Domain) => void
            getDomainById.mockResolvedValue(staleDomain).mockReturnValueOnce(
                new Promise<Domain>((resolve) => {
                    finishLookup = resolve
                }),
            )

            const bootstrap = service.onApplicationBootstrap()
            await vi.waitFor(() => expect(getDomainById).toHaveBeenCalled())
            expect(handleCheckInterval).not.toHaveBeenCalled()

            finishLookup(staleDomain)
            await bootstrap

            expect(handleCheckInterval).toHaveBeenCalledTimes(1)
            expect(regenerateCustomerSpfRecords.mock.invocationCallOrder[0]).toBeLessThan(
                handleCheckInterval.mock.invocationCallOrder[0]!,
            )
        })

        it('leaves the dns check to the regular interval while SEND_REQUIRE_VALID_DNS is off', async () => {
            await service.onApplicationBootstrap()

            expect(handleCheckInterval).not.toHaveBeenCalled()
        })

        it('logs a failed startup dns check without rejecting the hook', async () => {
            service = await createService({ sendRequireValidDns: true })
            handleCheckInterval.mockRejectedValue(new Error('lock store down for owner@example.com'))

            await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()

            await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith('Startup DNS check failed: Error'))
        })
    })

    describe('reconcileSendingDomain', () => {
        it('runs on application bootstrap', async () => {
            await service.onApplicationBootstrap()

            expectLockTaken()
            expect(createSendingDomain).toHaveBeenCalledWith(MAIL_HOSTNAME, expect.anything())
        })

        it('takes the sending domain lock before changing anything', async () => {
            await service.reconcileSendingDomain()

            expectLockTaken()
            expect(query.mock.invocationCallOrder[0]).toBeLessThan(createSendingDomain.mock.invocationCallOrder[0]!)
        })

        it('creates the MAIL_HOSTNAME sending domain and the settings row from the configured addresses', async () => {
            await service.reconcileSendingDomain()

            expect(createSendingDomain).toHaveBeenCalledWith(MAIL_HOSTNAME, {
                serverIpv4: SERVER_IPV4,
                serverIpv6: null,
            })
            expect(create).toHaveBeenCalledWith({ sendingDomainId: 10 }, { returning: true })
            expect(regenerateCustomerSpfRecords).toHaveBeenCalledWith(sendingDomain)
            expect(reloadDnsRecords).toHaveBeenCalledWith(10)
        })

        it('creates the sending domain with the configured IPv6 address', async () => {
            service = await createService({ serverIpv6: SERVER_IPV6 })

            await service.reconcileSendingDomain()

            expect(createSendingDomain).toHaveBeenCalledWith(MAIL_HOSTNAME, {
                serverIpv4: SERVER_IPV4,
                serverIpv6: SERVER_IPV6,
            })
        })

        it('creates the sending domain for a settings row without one', async () => {
            const row = settingsRow({ ...settings, sendingDomainId: null })
            findOne.mockResolvedValue(row)
            createSendingDomain.mockResolvedValue({ ...sendingDomain, domainId: 11 })

            await service.reconcileSendingDomain()

            expect(createSendingDomain).toHaveBeenCalledOnce()
            expect(row.sendingDomainId).toBe(11)
            expect(row.save).toHaveBeenCalledOnce()
            expect(create).not.toHaveBeenCalled()
        })

        it('logs a failed initial dns check without failing the creation', async () => {
            reloadDnsRecords.mockRejectedValue(
                Object.assign(new Error('lookup for user@example.org failed'), { code: 'ENOTFOUND' }),
            )

            await expect(service.reconcileSendingDomain()).resolves.toBeUndefined()

            expect(errorSpy).toHaveBeenCalledWith(
                `Initial DNS check for ${MAIL_HOSTNAME} failed: Error (code ENOTFOUND)`,
            )
        })

        it('refuses to create the sending domain while MAIL_HOSTNAME is registered as a customer domain', async () => {
            getDomainByFqdn.mockResolvedValue({
                ...sendingDomain,
                domainId: 12,
                dnsRecords: [
                    dnsRecord(DomainDnsRecordUse.SPF, DomainDnsRecordType.TXT, `v=spf1 include:${MAIL_HOSTNAME} ~all`),
                ],
            })

            await expect(service.reconcileSendingDomain()).rejects.toThrow(/registered as a customer domain/)
            expect(createSendingDomain).not.toHaveBeenCalled()
            expect(create).not.toHaveBeenCalled()
        })

        it('adopts a MAIL_HOSTNAME sending domain that no settings row points to', async () => {
            const orphan: Domain = { ...sendingDomain, domainId: 13 }
            getDomainByFqdn.mockResolvedValue(orphan)

            await service.reconcileSendingDomain()

            expect(createSendingDomain).not.toHaveBeenCalled()
            expect(recreateSendingDomainRecords).not.toHaveBeenCalled()
            expect(create).toHaveBeenCalledWith({ sendingDomainId: 13 }, { returning: true })
            expect(regenerateCustomerSpfRecords).toHaveBeenCalledWith(orphan)
        })

        it('regenerates the records of an adopted sending domain whose addresses differ', async () => {
            getDomainByFqdn.mockResolvedValue({ ...sendingDomain, domainId: 13, dnsRecords: [aRecord('203.0.113.99')] })

            await service.reconcileSendingDomain()

            expect(createSendingDomain).not.toHaveBeenCalled()
            expect(recreateSendingDomainRecords).toHaveBeenCalledWith(MAIL_HOSTNAME, {
                serverIpv4: SERVER_IPV4,
                serverIpv6: null,
            })
        })

        it('regenerates an incomplete record set even when the A record matches', async () => {
            findOne.mockResolvedValue(settingsRow(settings))
            getDomainById.mockResolvedValue({ ...sendingDomain, dnsRecords: [aRecord(SERVER_IPV4)] })

            await service.reconcileSendingDomain()

            expect(recreateSendingDomainRecords).toHaveBeenCalledWith(MAIL_HOSTNAME, {
                serverIpv4: SERVER_IPV4,
                serverIpv6: null,
            })
        })

        it('regenerates the records when a PTR record names another address', async () => {
            findOne.mockResolvedValue(settingsRow(settings))
            const records = fullRecordSet(SERVER_IPV4).map((record) =>
                record.use === DomainDnsRecordUse.PTR ? { ...record, host: '203.0.113.99' } : record,
            )
            getDomainById.mockResolvedValue({ ...sendingDomain, dnsRecords: records })

            await service.reconcileSendingDomain()

            expect(recreateSendingDomainRecords).toHaveBeenCalledOnce()
        })

        it('refuses to create the sending domain while a customer domain shares its registrable domain', async () => {
            getDomainByRootDomain.mockResolvedValue({
                ...sendingDomain,
                domainId: 12,
                fqdn: 'shop.sending-domain.org',
            })

            await expect(service.reconcileSendingDomain()).rejects.toThrow(/shares the registrable domain/)
            expect(getDomainByRootDomain).toHaveBeenCalledWith('sending-domain.org', undefined)
            expect(createSendingDomain).not.toHaveBeenCalled()
        })

        it('leaves a sending domain that matches MAIL_HOSTNAME and the configured addresses untouched', async () => {
            const row = settingsRow(settings)
            findOne.mockResolvedValue(row)

            await service.reconcileSendingDomain()

            expectNothingWritten()
            expect(row.save).not.toHaveBeenCalled()
            expect(warnSpy).not.toHaveBeenCalled()
        })

        it('regenerates the records in place when MAIL_SERVER_IPV4 changed', async () => {
            findOne.mockResolvedValue(settingsRow(settings))
            getDomainById.mockResolvedValue({ ...sendingDomain, dnsRecords: fullRecordSet('203.0.113.20') })

            await service.reconcileSendingDomain()

            expect(recreateSendingDomainRecords).toHaveBeenCalledWith(MAIL_HOSTNAME, {
                serverIpv4: SERVER_IPV4,
                serverIpv6: null,
            })
            expect(createSendingDomain).not.toHaveBeenCalled()
            expect(deleteDomain).not.toHaveBeenCalled()
            expect(regenerateCustomerSpfRecords).not.toHaveBeenCalled()
            expect(warnSpy).toHaveBeenCalledWith(
                `Server addresses of sending domain ${MAIL_HOSTNAME} changed to ${SERVER_IPV4}, regenerating its DNS records`,
            )
        })

        it('regenerates the records when MAIL_SERVER_IPV6 was added', async () => {
            service = await createService({ serverIpv6: SERVER_IPV6 })
            findOne.mockResolvedValue(settingsRow(settings))

            await service.reconcileSendingDomain()

            expect(recreateSendingDomainRecords).toHaveBeenCalledWith(MAIL_HOSTNAME, {
                serverIpv4: SERVER_IPV4,
                serverIpv6: SERVER_IPV6,
            })
        })

        it('regenerates the records when MAIL_SERVER_IPV6 was removed', async () => {
            findOne.mockResolvedValue(settingsRow(settings))
            getDomainById.mockResolvedValue({
                ...sendingDomain,
                dnsRecords: fullRecordSet(SERVER_IPV4, SERVER_IPV6),
            })

            await service.reconcileSendingDomain()

            expect(recreateSendingDomainRecords).toHaveBeenCalledWith(MAIL_HOSTNAME, {
                serverIpv4: SERVER_IPV4,
                serverIpv6: null,
            })
        })

        it('leaves a sending domain with matching IPv4 and IPv6 records untouched', async () => {
            service = await createService({ serverIpv6: SERVER_IPV6 })
            findOne.mockResolvedValue(settingsRow(settings))
            getDomainById.mockResolvedValue({
                ...sendingDomain,
                dnsRecords: fullRecordSet(SERVER_IPV4, SERVER_IPV6),
            })

            await service.reconcileSendingDomain()

            expect(recreateSendingDomainRecords).not.toHaveBeenCalled()
            expectNothingWritten()
        })

        it('switches a stale sending domain to MAIL_HOSTNAME with the configured addresses', async () => {
            service = await createService({ serverIpv6: SERVER_IPV6 })
            const row = settingsRow(settings)
            findOne.mockResolvedValue(row)
            getDomainById.mockResolvedValue(staleDomain)
            const newDomain: Domain = { ...sendingDomain, domainId: 11 }
            createSendingDomain.mockResolvedValue(newDomain)

            await service.reconcileSendingDomain()

            expect(deleteDomain).toHaveBeenCalledWith(10)
            expect(deleteDomain.mock.invocationCallOrder[0]).toBeLessThan(
                createSendingDomain.mock.invocationCallOrder[0]!,
            )
            expect(createSendingDomain).toHaveBeenCalledWith(MAIL_HOSTNAME, {
                serverIpv4: SERVER_IPV4,
                serverIpv6: SERVER_IPV6,
            })
            expect(row.sendingDomainId).toBe(11)
            expect(row.save).toHaveBeenCalledOnce()
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

        it('refuses to switch when a customer domain shares the registrable domain of MAIL_HOSTNAME', async () => {
            findOne.mockResolvedValue(settingsRow(settings))
            getDomainById.mockResolvedValue(staleDomain)
            const customerDomain: Domain = {
                ...sendingDomain,
                domainId: 12,
                fqdn: 'shop.sending-domain.org',
                rootDomain: 'sending-domain.org',
            }
            getDomainByRootDomain.mockResolvedValue(customerDomain)

            await expect(service.reconcileSendingDomain()).rejects.toThrow(
                new Error(
                    `MAIL_HOSTNAME ${MAIL_HOSTNAME} shares the registrable domain sending-domain.org with the customer domain shop.sending-domain.org. Rename MAIL_HOSTNAME or delete that domain before switching.`,
                ),
            )
            expect(getDomainByRootDomain).toHaveBeenCalledWith('sending-domain.org', 10)
            expect(deleteDomain).not.toHaveBeenCalled()
            expect(createSendingDomain).not.toHaveBeenCalled()
            expect(regenerateCustomerSpfRecords).not.toHaveBeenCalled()
        })

        it('checks the registrable domain without counting the current sending domain', async () => {
            findOne.mockResolvedValue(settingsRow(settings))
            getDomainById.mockResolvedValue(staleDomain)

            await service.reconcileSendingDomain()

            expect(getDomainByRootDomain).toHaveBeenCalledWith('sending-domain.org', 10)
            expect(createSendingDomain).toHaveBeenCalledWith(MAIL_HOSTNAME, expect.anything())
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
