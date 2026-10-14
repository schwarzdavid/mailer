import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { MailMessageQueryDto } from './mail-message-query.dto.js'
import { MailMessageSource, MailMessageStatus } from '../interfaces/mail-message.interface.js'

function toQuery(plain: Record<string, string>): MailMessageQueryDto {
    return plainToInstance(MailMessageQueryDto, plain, { exposeDefaultValues: true })
}

async function violations(plain: Record<string, string>): Promise<string[]> {
    const errors = await validate(toQuery(plain))
    return [...new Set(errors.map((error) => error.property))]
}

describe('MailMessageQueryDto', () => {
    it('defaults to the first page of 25 messages', async () => {
        await expect(violations({})).resolves.toEqual([])
        expect(toQuery({})).toMatchObject({ page: 1, itemsPerPage: 25 })
    })

    it('accepts every supported filter', async () => {
        await expect(
            violations({
                page: '2',
                itemsPerPage: '100',
                search: 'reader@',
                source: MailMessageSource.API,
                status: MailMessageStatus.BLOCKED,
            }),
        ).resolves.toEqual([])
    })

    it.each([
        [{ page: '0' }, 'page'],
        [{ itemsPerPage: '101' }, 'itemsPerPage'],
        [{ source: 'smtp' }, 'source'],
        [{ status: 'queued' }, 'status'],
        [{ search: 'x'.repeat(256) }, 'search'],
    ])('rejects %j', async (plain, property) => {
        await expect(violations(plain)).resolves.toContain(property)
    })
})
