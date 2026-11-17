import { Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
import type { InboundFormFieldDto } from 'api'
import { buildSampleData } from '../sampleData.ts'
import {
    clientImport,
    inlineScript,
    exampleRequest,
    formConstruction,
    installCommand,
    scriptTag,
    scriptTagConstruction,
    securityPlacement,
} from '../integrationSnippets.ts'

const baseUrl = 'https://mail.example.com'
const formKey = 'c4e7a1f09b3d6e2a8f5c1b7d0e9a4c3b'

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

function withoutImport(code: string): string {
    return code.split('\n').slice(1).join('\n')
}

describe('exampleRequest', () => {
    it('builds the form with the client and submits the sample data', () => {
        const result = exampleRequest(baseUrl, formKey, fields)

        expect(result).toContain("import { MailerForm } from '@schwarzdavid/mailer-client'")
        expect(result).toContain(`formKey: '${formKey}'`)
        expect(result).toContain("baseUrl: 'https://mail.example.com'")
        expect(result).toContain(JSON.stringify(buildSampleData(fields), null, 4))
        expect(result).toContain('await form.submit({ data })')
        expect(result).not.toContain('timedToken')
    })

    it('configures the timed token when the form has one', () => {
        expect(exampleRequest(baseUrl, formKey, fields, { key: 'formToken', location: 'body' })).toContain(
            "timedToken: { key: 'formToken', location: 'body' }",
        )
    })

    it('is valid JavaScript after the import line', () => {
        expect(parses(withoutImport(exampleRequest(baseUrl, formKey, fields)))).toBe(true)
        expect(
            parses(withoutImport(exampleRequest(baseUrl, formKey, fields, { key: 'formToken', location: 'query' }))),
        ).toBe(true)
    })
})

describe('installCommand and clientImport', () => {
    it('name the npm package', () => {
        expect(installCommand()).toBe('npm install @schwarzdavid/mailer-client')
        expect(clientImport()).toBe("import { MailerForm } from '@schwarzdavid/mailer-client'")
    })
})

describe('formConstruction', () => {
    it('builds the form without a timed token', () => {
        expect(formConstruction(baseUrl, formKey)).toBe(
            `const form = new MailerForm({\n    baseUrl: '${baseUrl}',\n    formKey: '${formKey}',\n})`,
        )
    })

    it('adds the timed token scheme', () => {
        expect(formConstruction(baseUrl, formKey, { key: 'formToken', location: 'query' })).toBe(
            `const form = new MailerForm({\n    baseUrl: '${baseUrl}',\n    formKey: '${formKey}',\n    timedToken: { key: 'formToken', location: 'query' },\n})`,
        )
    })
})

describe('scriptTagConstruction', () => {
    it('builds the form from the global MailerClient with the base url', () => {
        expect(scriptTagConstruction(baseUrl, formKey, { key: 'formToken', location: 'body' })).toBe(
            `const form = new MailerClient.MailerForm({\n    baseUrl: '${baseUrl}',\n    formKey: '${formKey}',\n    timedToken: { key: 'formToken', location: 'body' },\n})`,
        )
        expect(scriptTagConstruction(baseUrl, formKey)).not.toContain('timedToken')
    })
})

describe('inlineScript', () => {
    it('wraps code in its own script element', () => {
        expect(inlineScript('run()')).toBe('<script>\nrun()\n</script>')
    })
})

describe('scriptTag', () => {
    it('builds a script element for the source', () => {
        expect(scriptTag('https://example.com/a.js')).toBe('<script src="https://example.com/a.js"></script>')
    })
})

describe('securityPlacement', () => {
    it('nests the value under security in the body', () => {
        expect(securityPlacement({ location: 'body', key: 'formToken' }, 'token')).toBe(
            'await form.submit({ data, security: { formToken: token } })',
        )
    })

    it('quotes body keys that are not identifiers', () => {
        expect(securityPlacement({ location: 'body', key: 'g-recaptcha-response' }, 'token')).toContain(
            "security: { 'g-recaptcha-response': token }",
        )
    })

    it('adds the value as a header', () => {
        expect(securityPlacement({ location: 'header', key: 'x-captcha' }, 'token')).toBe(
            "await form.submit({ data, headers: { 'x-captcha': token } })",
        )
    })

    it('adds the value as a query parameter', () => {
        expect(securityPlacement({ location: 'query', key: 'formToken' }, 'token')).toBe(
            'await form.submit({ data, query: { formToken: token } })',
        )
    })
})
