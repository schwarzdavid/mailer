import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { BounceQueryDto } from './bounce-query.dto.js'
import { BounceType } from '../interfaces/bounce.interface.js'

function toQuery(plain: Record<string, string>): BounceQueryDto {
    return plainToInstance(BounceQueryDto, plain, { exposeDefaultValues: true })
}

async function violations(plain: Record<string, string>): Promise<string[]> {
    const errors = await validate(toQuery(plain))
    return [...new Set(errors.map((error) => error.property))]
}

describe('BounceQueryDto', () => {
    it('defaults to the first page of 25 newest bounces', async () => {
        await expect(violations({})).resolves.toEqual([])
        expect(toQuery({})).toMatchObject({ page: 1, itemsPerPage: 25, sortBy: 'receivedAt', sortOrder: 'desc' })
    })

    it('converts the numeric query strings', () => {
        expect(toQuery({ page: '3', itemsPerPage: '100' })).toMatchObject({ page: 3, itemsPerPage: 100 })
    })

    it('accepts every supported filter and sort option', async () => {
        await expect(
            violations({
                page: '2',
                itemsPerPage: '10',
                search: 'mailbox',
                type: BounceType.TRANSIENT,
                receivedAfter: '2026-07-13T10:00:00.000Z',
                sortBy: 'type',
                sortOrder: 'asc',
            }),
        ).resolves.toEqual([])
    })

    it.each([
        ['a page below 1', { page: '0' }, 'page'],
        ['a fractional page', { page: '1.5' }, 'page'],
        ['a non-numeric page', { page: 'two' }, 'page'],
        ['a page size below 1', { itemsPerPage: '0' }, 'itemsPerPage'],
        ['a page size above 100', { itemsPerPage: '101' }, 'itemsPerPage'],
        ['an unknown bounce type', { type: 'soft' }, 'type'],
        ['a malformed date', { receivedAfter: 'yesterday' }, 'receivedAfter'],
        ['an impossible date', { receivedAfter: '2026-02-30T10:00:00Z' }, 'receivedAfter'],
        ['an unknown sort field', { sortBy: 'emailAddress' }, 'sortBy'],
        ['an unknown sort order', { sortOrder: 'up' }, 'sortOrder'],
        ['an overlong search', { search: 's'.repeat(256) }, 'search'],
    ])('rejects %s', async (_case, plain, property) => {
        await expect(violations(plain)).resolves.toEqual([property])
    })
})
