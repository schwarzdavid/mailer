import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Interval } from '@nestjs/schedule'
import { QueryTypes } from 'sequelize'
import { Sequelize } from 'sequelize-typescript'
import { ImapFlow } from 'imapflow'
import { DsnParserService } from './dsn-parser.service'
import { BounceService } from './bounce.service'
import { BOUNCE_POLL_INTERVAL_MS, BOUNCE_POLL_LOCK_KEY } from '../bounce.constants'

@Injectable()
export class BounceMailboxService implements OnApplicationBootstrap {
    private readonly logger = new Logger(BounceMailboxService.name)
    private roundRunning = false

    constructor(
        private readonly configService: ConfigService,
        private readonly sequelize: Sequelize,
        private readonly dsnParserService: DsnParserService,
        private readonly bounceService: BounceService,
    ) {}

    onApplicationBootstrap(): void {
        if (!this.configService.get<string>('IMAP_HOST')) {
            this.logger.warn('IMAP_HOST is not configured, bounce mailbox polling is disabled')
            return
        }

        this.logger.log(`Polling bounce mailbox every ${BOUNCE_POLL_INTERVAL_MS / 1000}s`)
    }

    @Interval(BOUNCE_POLL_INTERVAL_MS)
    async handlePollInterval(): Promise<void> {
        if (!this.configService.get<string>('IMAP_HOST')) {
            return
        }

        try {
            await this.pollRound()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.logger.error(`Bounce mailbox poll failed: ${message}`)
        }
    }

    async pollRound(): Promise<void> {
        if (this.roundRunning) {
            return
        }
        this.roundRunning = true

        try {
            await this.sequelize.transaction(async (transaction) => {
                const [lock] = await this.sequelize.query<{ acquired: boolean }>(
                    'SELECT pg_try_advisory_xact_lock(:key) AS "acquired"',
                    { replacements: { key: BOUNCE_POLL_LOCK_KEY }, type: QueryTypes.SELECT, transaction },
                )
                if (!lock?.acquired) {
                    return
                }

                await this.processMailbox()
            })
        } finally {
            this.roundRunning = false
        }
    }

    private async processMailbox(): Promise<void> {
        const client = new ImapFlow({
            host: this.configService.getOrThrow<string>('IMAP_HOST'),
            port: Number(this.configService.get<string>('IMAP_PORT', '993')),
            secure: this.configService.get<string>('IMAP_SECURE', 'true') === 'true',
            auth: {
                user: this.configService.getOrThrow<string>('IMAP_USER'),
                pass: this.configService.getOrThrow<string>('IMAP_PASSWORD'),
            },
            logger: false,
        })

        await client.connect()
        try {
            const mailbox = await client.getMailboxLock('INBOX')
            try {
                const uids = (await client.search({ seen: false }, { uid: true })) || []
                for (const uid of uids) {
                    try {
                        await this.processMessage(client, uid)
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error)
                        this.logger.error(`Processing bounce message ${uid} failed: ${message}`)
                    }
                }
            } finally {
                mailbox.release()
            }
        } finally {
            await client.logout()
        }
    }

    private async processMessage(client: ImapFlow, uid: number): Promise<void> {
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true })
        if (!message || !message.source) {
            return
        }

        const dsn = await this.dsnParserService.parse(message.source)
        if (!dsn) {
            this.logger.debug(`Skipping non-DSN message ${uid}`)
            await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
            return
        }

        for (const recipient of dsn.recipients) {
            await this.bounceService.recordBounce({
                ...recipient,
                messageId: dsn.messageId,
                receivedAt: dsn.receivedAt,
            })
        }

        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
    }
}
