import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { InboundFormTemplateDraftDto } from './inbound-form-template.dto.js'

async function violations(plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(InboundFormTemplateDraftDto, plain, { exposeDefaultValues: true }))
    return errors.map((error) => error.property)
}

describe('InboundFormTemplateDraftDto', () => {
    it('accepts a subject and template body', async () => {
        await expect(
            violations({ subject: 'Message from {{firstName}}', template: '<p>{{message}}</p>' }),
        ).resolves.toEqual([])
    })

    it('accepts an empty draft while the template is being written', async () => {
        await expect(violations({ subject: '', template: '' })).resolves.toEqual([])
    })

    it('rejects a subject longer than 255 characters', async () => {
        await expect(violations({ subject: 's'.repeat(256), template: '' })).resolves.toEqual(['subject'])
    })

    it('requires both parts as strings', async () => {
        await expect(violations({})).resolves.toEqual(['subject', 'template'])
        await expect(violations({ subject: 1, template: { html: '' } })).resolves.toEqual(['subject', 'template'])
    })
})
