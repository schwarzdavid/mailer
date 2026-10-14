import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { InboundFormCreateDto, InboundFormUpdateDto } from './inbound-form-create.dto.js'

async function createViolations(plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(InboundFormCreateDto, plain, { exposeDefaultValues: true }))
    return errors.map((error) => error.property)
}

async function updateViolations(plain: object): Promise<string[]> {
    const errors = await validate(plainToInstance(InboundFormUpdateDto, plain, { exposeDefaultValues: true }))
    return errors.map((error) => error.property)
}

describe('InboundFormCreateDto', () => {
    const valid = { name: 'Contact', slug: 'contact-form-2', domainId: 3, projectId: 1 }

    it('accepts a complete form', async () => {
        await expect(createViolations(valid)).resolves.toEqual([])
    })

    it('defaults the domain to null when omitted', async () => {
        const withoutDomain = { name: valid.name, slug: valid.slug, projectId: valid.projectId }

        await expect(createViolations(withoutDomain)).resolves.toEqual([])
        expect(plainToInstance(InboundFormCreateDto, withoutDomain, { exposeDefaultValues: true }).domainId).toBeNull()
    })

    it('accepts an explicit null domain', async () => {
        await expect(createViolations({ ...valid, domainId: null })).resolves.toEqual([])
    })

    it.each([
        ['an uppercase slug', 'Contact'],
        ['a slug with spaces', 'contact form'],
        ['a slug with a leading hyphen', '-contact'],
        ['a slug with a trailing hyphen', 'contact-'],
        ['a slug with consecutive hyphens', 'contact--form'],
        ['a slug with path characters', '../admin'],
        ['an empty slug', ''],
    ])('rejects %s', async (_, slug) => {
        await expect(createViolations({ ...valid, slug })).resolves.toEqual(['slug'])
    })

    it('rejects a slug longer than 255 characters', async () => {
        await expect(createViolations({ ...valid, slug: 'a'.repeat(256) })).resolves.toEqual(['slug'])
    })

    it('rejects an empty or overlong name', async () => {
        await expect(createViolations({ ...valid, name: '' })).resolves.toEqual(['name'])
        await expect(createViolations({ ...valid, name: 'n'.repeat(256) })).resolves.toEqual(['name'])
    })

    it('requires an integer project id', async () => {
        await expect(createViolations({ ...valid, projectId: undefined })).resolves.toEqual(['projectId'])
        await expect(createViolations({ ...valid, projectId: '1' })).resolves.toEqual(['projectId'])
        await expect(createViolations({ ...valid, projectId: 1.5 })).resolves.toEqual(['projectId'])
    })

    it('rejects a non-integer domain id', async () => {
        await expect(createViolations({ ...valid, domainId: 'three' })).resolves.toEqual(['domainId'])
    })
})

describe('InboundFormUpdateDto', () => {
    it('accepts an empty patch', async () => {
        await expect(updateViolations({})).resolves.toEqual([])
    })

    it('accepts a partial patch', async () => {
        await expect(updateViolations({ isActive: false, domainId: null })).resolves.toEqual([])
    })

    it('applies the slug rules to a renamed slug', async () => {
        await expect(updateViolations({ slug: 'Not A Slug' })).resolves.toEqual(['slug'])
    })

    it('rejects an empty name and a non-boolean active flag', async () => {
        await expect(updateViolations({ name: '', isActive: 'yes' })).resolves.toEqual(['name', 'isActive'])
    })
})
