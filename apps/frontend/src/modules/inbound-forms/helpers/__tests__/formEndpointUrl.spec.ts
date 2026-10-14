import { describe, expect, it } from 'vitest'
import { formEndpointUrl } from '../formEndpointUrl.ts'

describe('formEndpointUrl', () => {
    it('builds the public submission endpoint on the current origin', () => {
        expect(formEndpointUrl('contact')).toBe(`${location.origin}/api/public/form/contact`)
    })

    it('keeps hyphenated slugs intact', () => {
        expect(formEndpointUrl('contact-us-2')).toBe(`${location.origin}/api/public/form/contact-us-2`)
    })
})
