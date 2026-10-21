import { Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
import type { InboundFormFieldDto } from 'api'
import { buildSampleData } from '../sampleData.ts'
import { exampleRequest, scriptTag, securityPlacement } from '../integrationSnippets.ts'

const endpoint = 'https://mail.example.com/api/public/form/kontakt'

const fields: InboundFormFieldDto[] = [
    { inboundFormFieldId: 1, key: 'name', label: 'Name', type: 'text', defaultValue: null, validation: null },
    { inboundFormFieldId: 2, key: 'email', label: 'Email', type: 'email', defaultValue: null, validation: null },
]

function parses(code: string): boolean {
    try {
        new Script(`(async () => {
${code}
})`)
        return true
    } catch {
        return false
    }
}

describe('exampleRequest', () => {
    it('posts the sample data as JSON without security values', () => {
        const result = exampleRequest(endpoint, fields)

        expect(result).toContain(`fetch('${endpoint}'`)
        expect(result).toContain("method: 'POST'")
        expect(result).toContain("'Content-Type': 'application/json'")
        expect(result).toContain(JSON.stringify(buildSampleData(fields), null, 4))
        expect(result).not.toContain('security')
    })

    it('throws when the response is not ok', () => {
        expect(exampleRequest(endpoint, fields)).toContain('if (!response.ok)')
    })

    it('is valid JavaScript', () => {
        expect(parses(exampleRequest(endpoint, fields))).toBe(true)
    })
})

describe('scriptTag', () => {
    it('builds a script element for the source', () => {
        expect(scriptTag('https://example.com/a.js')).toBe('<script src="https://example.com/a.js"></script>')
    })
})

describe('securityPlacement', () => {
    it('nests the value under security in the body', () => {
        expect(securityPlacement(endpoint, { location: 'body', key: 'formToken' }, 'token')).toBe(
            'body: JSON.stringify({ data, security: { formToken: token } })',
        )
    })

    it('quotes body keys that are not identifiers', () => {
        expect(securityPlacement(endpoint, { location: 'body', key: 'g-recaptcha-response' }, 'token')).toContain(
            "security: { 'g-recaptcha-response': token }",
        )
    })

    it('adds the value as a header next to the content type', () => {
        expect(securityPlacement(endpoint, { location: 'header', key: 'x-captcha' }, 'token')).toBe(
            "headers: { 'Content-Type': 'application/json', 'x-captcha': token }",
        )
    })

    it('appends the encoded value to the endpoint as a query parameter', () => {
        expect(securityPlacement(endpoint, { location: 'query', key: 'formToken' }, 'token')).toBe(
            `fetch(\`${endpoint}?formToken=\${encodeURIComponent(token)}\`, …)`,
        )
    })
})
