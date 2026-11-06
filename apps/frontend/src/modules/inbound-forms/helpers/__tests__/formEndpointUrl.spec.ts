import { describe, expect, it } from 'vitest'
import { formClientScriptUrl, formEndpointPath, formEndpointUrl } from '../formEndpointUrl.ts'

describe('formEndpointUrl', () => {
    it('builds the public submission endpoint on the current origin', () => {
        expect(formEndpointUrl('Xk3_a-9QpLm2Zr7Tb1Wv0c')).toBe(`${location.origin}/api/v1/forms/Xk3_a-9QpLm2Zr7Tb1Wv0c`)
    })

    it('builds the endpoint path without the origin', () => {
        expect(formEndpointPath('Xk3_a-9QpLm2Zr7Tb1Wv0c')).toBe('/api/v1/forms/Xk3_a-9QpLm2Zr7Tb1Wv0c')
    })

    it('serves the client script next to the form endpoints', () => {
        expect(formClientScriptUrl()).toBe(`${location.origin}/api/v1/forms/client.js`)
    })
})
