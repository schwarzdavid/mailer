import { describe, expect, it } from 'vitest'
import { formClientScriptUrl, formEndpointPath, formEndpointUrl } from '../formEndpointUrl.ts'

describe('formEndpointUrl', () => {
    it('builds the public submission endpoint on the current origin', () => {
        expect(formEndpointUrl('3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c')).toBe(
            `${location.origin}/api/v1/forms/3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c`,
        )
    })

    it('builds the endpoint path without the origin', () => {
        expect(formEndpointPath('3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c')).toBe(
            '/api/v1/forms/3f9a0c1e7b2d4a6f8e5c9b0d1a2f4e6c',
        )
    })

    it('serves the client script next to the form endpoints', () => {
        expect(formClientScriptUrl()).toBe(`${location.origin}/api/v1/forms/client.js`)
    })
})
