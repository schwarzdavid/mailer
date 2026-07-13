import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { Sequelize } from 'sequelize-typescript'
import { ImapFlow } from 'imapflow'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { BounceMailboxService } from './bounce-mailbox.service'
import { DsnParserService, ParsedDsn } from './dsn-parser.service'
import { BounceService } from './bounce.service'
import { BounceType } from '../interfaces/bounce.interface'

const { imapClient } = vi.hoisted(() => ({
    imapClient: {
        connect: vi.fn(),
        logout: vi.fn(),
        getMailboxLock: vi.fn(),
        search: vi.fn(),
        fetchOne: vi.fn(),
        messageFlagsAdd: vi.fn(),
    },
}))

vi.mock('imapflow', () => ({
    ImapFlow: vi.fn(function () {
        return imapClient
    }),
}))

const dsn: ParsedDsn = {
    messageId: '<dsn-1@relay.example.com>',
    receivedAt: new Date('2026-07-13T10:00:00.000Z'),
    recipients: [
        {
            emailAddress: 'missing@example.org',
            type: BounceType.PERMANENT,
            statusCode: '5.1.1',
            reason: 'User unknown',
        },
    ],
}

describe('BounceMailboxService', () => {
    let service: BounceMailboxService
    let parse: Mock<DsnParserService['parse']>
    let recordBounce: Mock<BounceService['recordBounce']>
    let query: Mock<(sql: string, options: unknown) => Promise<{ acquired: boolean }[]>>
    let transaction: Mock<(callback: (t: unknown) => PromiseLike<unknown>) => Promise<unknown>>
    let config: Record<string, string>
    let errorSpy: Mock<Logger['error']>

    beforeEach(async () => {
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
        errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        config = {
            IMAP_HOST: 'imap.example.com',
            IMAP_USER: 'bounces',
            IMAP_PASSWORD: 'secret',
        }

        parse = vi.fn<typeof parse>().mockResolvedValue(dsn)
        recordBounce = vi.fn<typeof recordBounce>().mockResolvedValue(undefined)
        query = vi.fn<typeof query>().mockResolvedValue([{ acquired: true }])
        transaction = vi
            .fn<typeof transaction>()
            .mockImplementation(async (callback: (t: unknown) => PromiseLike<unknown>) => callback(null))

        imapClient.connect.mockResolvedValue(undefined)
        imapClient.logout.mockResolvedValue(undefined)
        imapClient.getMailboxLock.mockResolvedValue({ release: vi.fn() })
        imapClient.search.mockResolvedValue([42])
        imapClient.fetchOne.mockResolvedValue({ source: Buffer.from('raw mail') })
        imapClient.messageFlagsAdd.mockResolvedValue(true)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BounceMailboxService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: (key: string, fallback?: string) => config[key] ?? fallback,
                        getOrThrow: (key: string) => {
                            const value = config[key]
                            if (value === undefined) {
                                throw new Error(`Missing ${key}`)
                            }
                            return value
                        },
                    },
                },
                { provide: Sequelize, useValue: { query, transaction } },
                { provide: DsnParserService, useValue: { parse } },
                { provide: BounceService, useValue: { recordBounce } },
            ],
        }).compile()

        service = module.get(BounceMailboxService)
    })

    afterEach(() => {
        service.onApplicationShutdown()
        vi.clearAllMocks()
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    it('records every recipient of a fetched DSN and marks the message seen', async () => {
        await service.pollRound()

        expect(ImapFlow).toHaveBeenCalledWith(
            expect.objectContaining({ host: 'imap.example.com', port: 993, secure: true }),
        )
        expect(imapClient.search).toHaveBeenCalledWith({ seen: false }, { uid: true })
        expect(recordBounce).toHaveBeenCalledWith({
            emailAddress: 'missing@example.org',
            type: BounceType.PERMANENT,
            statusCode: '5.1.1',
            reason: 'User unknown',
            messageId: '<dsn-1@relay.example.com>',
            receivedAt: dsn.receivedAt,
        })
        expect(imapClient.messageFlagsAdd).toHaveBeenCalledWith('42', ['\\Seen'], { uid: true })
        expect(imapClient.logout).toHaveBeenCalled()
    })

    it('marks non-DSN messages seen without recording anything', async () => {
        parse.mockResolvedValue(null)

        await service.pollRound()

        expect(recordBounce).not.toHaveBeenCalled()
        expect(imapClient.messageFlagsAdd).toHaveBeenCalledWith('42', ['\\Seen'], { uid: true })
    })

    it('isolates a per-message failure so later messages are still processed and marked seen', async () => {
        imapClient.search.mockResolvedValue([42, 43])
        recordBounce.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined)

        await service.pollRound()

        expect(errorSpy).toHaveBeenCalledWith('Processing bounce message 42 failed: boom')
        expect(imapClient.messageFlagsAdd).not.toHaveBeenCalledWith('42', ['\\Seen'], { uid: true })
        expect(imapClient.messageFlagsAdd).toHaveBeenCalledWith('43', ['\\Seen'], { uid: true })
    })

    it('skips the round when another instance holds the advisory lock', async () => {
        query.mockResolvedValue([{ acquired: false }])

        await service.pollRound()

        expect(ImapFlow).not.toHaveBeenCalled()
        expect(recordBounce).not.toHaveBeenCalled()
    })

    it('does not start polling when IMAP_HOST is missing', () => {
        delete config.IMAP_HOST
        vi.useFakeTimers()
        const pollRound = vi.spyOn(service, 'pollRound')

        service.onApplicationBootstrap()
        vi.advanceTimersByTime(120_000)

        expect(pollRound).not.toHaveBeenCalled()
    })

    it('polls on the configured interval and stops on shutdown', () => {
        config.IMAP_POLL_INTERVAL_SECONDS = '30'
        vi.useFakeTimers()
        const pollRound = vi.spyOn(service, 'pollRound').mockResolvedValue(undefined)

        service.onApplicationBootstrap()
        vi.advanceTimersByTime(60_000)
        expect(pollRound).toHaveBeenCalledTimes(2)

        service.onApplicationShutdown()
        vi.advanceTimersByTime(60_000)
        expect(pollRound).toHaveBeenCalledTimes(2)
    })

    it('falls back to the 60s default when the poll interval is an empty string', () => {
        config.IMAP_POLL_INTERVAL_SECONDS = ''
        vi.useFakeTimers()
        const pollRound = vi.spyOn(service, 'pollRound').mockResolvedValue(undefined)

        service.onApplicationBootstrap()
        vi.advanceTimersByTime(120_000)

        expect(pollRound).toHaveBeenCalledTimes(2)
    })
})
