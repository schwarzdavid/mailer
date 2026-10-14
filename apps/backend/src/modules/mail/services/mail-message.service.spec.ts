import { createMongoAbility } from '@casl/ability'
import { NotFoundException } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test } from '@nestjs/testing'
import { Op } from 'sequelize'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { MailMessageService } from './mail-message.service.js'
import { AppAbility } from '../../permission/interfaces/app-ability.js'
import { MailMessageModel } from '../models/mail-message.model.js'
import { MailMessage, MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'

type MailMessageRow = MailMessage & { get(options: { plain: true }): MailMessage }

describe('MailMessageService', () => {
    let service: MailMessageService
    let create: Mock<(values: Partial<MailMessage>) => Promise<MailMessageRow>>
    let update: Mock<(values: Partial<MailMessage>, options: { where: { mailMessageId: number } }) => Promise<[number]>>
    let findAndCountAll: Mock<(options: object) => Promise<{ rows: MailMessageRow[]; count: number }>>

    const message: MailMessage = {
        mailMessageId: 5,
        projectId: 3,
        source: MailMessageSource.API,
        apiKeyId: 9,
        emailFrom: 'news@mail.example.com',
        emailTo: 'reader@example.org',
        subject: 'Hello',
        status: MailMessageStatus.PENDING,
        error: null,
        smtpMessageId: null,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
    }
    const row: MailMessageRow = { ...message, get: () => message }

    beforeEach(async () => {
        create = vi.fn<typeof create>().mockResolvedValue(row)
        update = vi.fn<typeof update>().mockResolvedValue([1])
        findAndCountAll = vi.fn<typeof findAndCountAll>().mockResolvedValue({ rows: [row], count: 31 })

        const module = await Test.createTestingModule({
            providers: [
                MailMessageService,
                { provide: getModelToken(MailMessageModel), useValue: { create, update, findAndCountAll } },
            ],
        }).compile()
        service = module.get(MailMessageService)
    })

    it('records a pending message without delivery details', async () => {
        const result = await service.recordPending({
            projectId: 3,
            source: MailMessageSource.API,
            apiKeyId: 9,
            emailFrom: 'news@mail.example.com',
            emailTo: 'reader@example.org',
            subject: 'Hello',
        })

        expect(create).toHaveBeenCalledWith({
            projectId: 3,
            source: MailMessageSource.API,
            apiKeyId: 9,
            emailFrom: 'news@mail.example.com',
            emailTo: 'reader@example.org',
            subject: 'Hello',
            status: MailMessageStatus.PENDING,
            error: null,
            smtpMessageId: null,
            sentAt: null,
        })
        expect(result).toEqual(message)
    })

    it('records a rendered subject longer than 998 characters unchanged', async () => {
        const renderedSubject = `New submission: ${'s'.repeat(5_000)}`

        await service.recordPending({
            projectId: 3,
            source: MailMessageSource.INBOUND_FORM,
            apiKeyId: null,
            emailFrom: 'forms@mail.example.com',
            emailTo: 'owner@example.org',
            subject: renderedSubject,
        })

        expect(create).toHaveBeenCalledWith(expect.objectContaining({ subject: renderedSubject }))
    })

    it('marks a message sent with its SMTP message id', async () => {
        await service.markSent(5, '<abc@mail.example.com>')

        expect(update).toHaveBeenCalledWith(
            {
                status: MailMessageStatus.SENT,
                smtpMessageId: '<abc@mail.example.com>',
                sentAt: expect.any(Date) as Date,
            },
            { where: { mailMessageId: 5 } },
        )
    })

    it('marks a message blocked or failed with the error text', async () => {
        await service.markUnsent(5, MailMessageStatus.BLOCKED, 'Recipient blocked')

        expect(update).toHaveBeenCalledWith(
            { status: MailMessageStatus.BLOCKED, error: 'Recipient blocked' },
            { where: { mailMessageId: 5 } },
        )
    })

    it('pages project messages newest first with filters and a total', async () => {
        const result = await service.getProjectMessages(3, {
            page: 2,
            itemsPerPage: 10,
            source: MailMessageSource.INBOUND_FORM,
            status: MailMessageStatus.FAILED,
        })

        expect(findAndCountAll).toHaveBeenCalledWith({
            where: {
                [Op.and]: [
                    { projectId: 3 },
                    { source: MailMessageSource.INBOUND_FORM },
                    { status: MailMessageStatus.FAILED },
                ],
            },
            order: [['mailMessageId', 'DESC']],
            limit: 10,
            offset: 10,
        })
        expect(result).toEqual({ items: [message], total: 31 })
    })

    it('searches recipient and subject case-insensitively with LIKE wildcards escaped', async () => {
        await service.getProjectMessages(3, { page: 1, itemsPerPage: 25, search: ' 50%_off ' })

        expect(findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    [Op.and]: [
                        { projectId: 3 },
                        {
                            [Op.or]: [
                                { emailTo: { [Op.iLike]: '%50\\%\\_off%' } },
                                { subject: { [Op.iLike]: '%50\\%\\_off%' } },
                            ],
                        },
                    ],
                },
                offset: 0,
            }),
        )
    })

    describe('listForProject', () => {
        const reader = createMongoAbility<AppAbility>([
            { action: 'read', subject: 'Project', conditions: { projectId: { $in: [3] } } },
        ])

        it('pages the messages of a readable project', async () => {
            await expect(service.listForProject(3, { page: 1, itemsPerPage: 25 }, reader)).resolves.toEqual({
                items: [message],
                total: 31,
            })
        })

        it('hides projects the caller cannot read', async () => {
            await expect(service.listForProject(4, { page: 1, itemsPerPage: 25 }, reader)).rejects.toThrow(
                NotFoundException,
            )
            expect(findAndCountAll).not.toHaveBeenCalled()
        })
    })
})
