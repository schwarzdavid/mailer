import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { InboundFormReceiverCreateDto, InboundFormReceiverUpdateDto } from './inbound-form-receiver.dto.js'

async function createViolations(plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(InboundFormReceiverCreateDto, plain, { exposeDefaultValues: true }))
    return errors.map((error) => error.property)
}

async function updateViolations(plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(InboundFormReceiverUpdateDto, plain, { exposeDefaultValues: true }))
    return errors.map((error) => error.property)
}

describe('InboundFormReceiverCreateDto', () => {
    const valid = { emailFrom: 'noreply@mail.example.com', emailReceiver: 'owner@business.com' }

    it('accepts a receiver and defaults it to active without a reply-to', async () => {
        await expect(createViolations(valid)).resolves.toEqual([])

        const dto = plainToInstance(InboundFormReceiverCreateDto, valid, { exposeDefaultValues: true })
        expect(dto.isActive).toBe(true)
        expect(dto.emailReplyTo).toBeNull()
    })

    it('accepts a field placeholder as the receiver and reply-to', async () => {
        await expect(
            createViolations({ ...valid, emailReceiver: '{{email}}', emailReplyTo: '{{email}}' }),
        ).resolves.toEqual([])
    })

    it.each(['noreply', 'noreply@', '{{email}}', ''])('rejects the sender "%s"', async (emailFrom) => {
        await expect(createViolations({ ...valid, emailFrom })).resolves.toEqual(['emailFrom'])
    })

    it('rejects an empty receiver', async () => {
        await expect(createViolations({ ...valid, emailReceiver: '' })).resolves.toEqual(['emailReceiver'])
    })

    it('rejects addresses longer than 255 characters', async () => {
        const long = `${'a'.repeat(250)}@example.com`

        await expect(createViolations({ emailFrom: long, emailReceiver: long, emailReplyTo: long })).resolves.toEqual([
            'emailFrom',
            'emailReceiver',
            'emailReplyTo',
        ])
    })

    it('rejects a non-boolean active flag', async () => {
        await expect(createViolations({ ...valid, isActive: 'false' })).resolves.toEqual(['isActive'])
    })
})

describe('InboundFormReceiverUpdateDto', () => {
    it('accepts an empty patch', async () => {
        await expect(updateViolations({})).resolves.toEqual([])
    })

    it('allows clearing the reply-to', async () => {
        await expect(updateViolations({ emailReplyTo: null })).resolves.toEqual([])
    })

    it('still validates the fields it carries', async () => {
        await expect(updateViolations({ emailFrom: 'not-an-email', emailReceiver: '' })).resolves.toEqual([
            'emailFrom',
            'emailReceiver',
        ])
    })
})
