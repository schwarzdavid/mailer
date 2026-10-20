import { Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
import type { InboundFormFieldDto } from 'api'
import { buildSampleData } from '../sampleData.ts'
import { exampleRequest, honeypotSnippet, recaptchaSnippet, timedTokenSnippet } from '../integrationSnippets.ts'

const endpoint = 'https://mail.example.com/api/public/form/kontakt'
const scriptUrl = 'https://mail.example.com/api/public/form/client.js'

const fields: InboundFormFieldDto[] = [
    { inboundFormFieldId: 1, key: 'name', label: 'Name', type: 'text', defaultValue: null, validation: null },
    { inboundFormFieldId: 2, key: 'email', label: 'Email', type: 'email', defaultValue: null, validation: null },
]

function inlineScripts(html: string): string[] {
    return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? '')
}

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

function inlineScriptsParse(html: string): boolean {
    const scripts = inlineScripts(html)
    return scripts.length > 0 && scripts.every(parses)
}

const guard = 'form[data-inbound-form="kontakt"]'
describe('exampleRequest', () => {
    it('posts the sample data as JSON without security values', () => {
        const result = exampleRequest(endpoint, fields)

        expect(result).toContain(`fetch('${endpoint}'`)
        expect(result).toContain("method: 'POST'")
        expect(result).toContain("'Content-Type': 'application/json'")
        expect(result).toContain(JSON.stringify(buildSampleData(fields), null, 4))
        expect(result).not.toContain('security')
    })

    it('is valid JavaScript', () => {
        expect(parses(exampleRequest(endpoint, fields))).toBe(true)
    })
})

describe('honeypotSnippet', () => {
    it('is valid JavaScript', () => {
        expect(inlineScriptsParse(honeypotSnippet(endpoint, 'kontakt', { key: 'website' }))).toBe(true)
        expect(inlineScriptsParse(honeypotSnippet(endpoint, 'kontakt', { key: 'my-field' }))).toBe(true)
    })

    it('hides the field with CSS and sends its value under security', () => {
        const result = honeypotSnippet(endpoint, 'kontakt', { key: 'website' })

        expect(result).toContain('name="website" tabindex="-1" autocomplete="off" class="hp-field"')
        expect(result).toContain('.hp-field')
        expect(result).toContain('left: -9999px')
        expect(result).not.toContain('type="hidden"')
        expect(result).toContain("const security = { website: form.elements['website'].value }")
        expect(result).toContain('JSON.stringify({ data, security })')
    })
})

describe('recaptchaSnippet', () => {
    it('is valid JavaScript for every location and waits for grecaptcha.ready', () => {
        for (const location of ['body', 'header', 'query'] as const) {
            const result = recaptchaSnippet(endpoint, 'kontakt', {
                location,
                key: 'g-recaptcha-response',
                config: null,
            })

            expect(inlineScriptsParse(result)).toBe(true)
            expect(result).toContain('grecaptcha.ready(resolve)')
            expect(result).not.toContain("querySelector('form')")
        }
    })

    it('loads the Google script and executes with the expected action', () => {
        const result = recaptchaSnippet(endpoint, 'kontakt', {
            location: 'body',
            key: 'g-recaptcha-response',
            config: { expectedAction: 'contact' },
        })

        expect(result).toContain('https://www.google.com/recaptcha/api.js?render=SITE_KEY')
        expect(result).toContain("grecaptcha.execute('SITE_KEY', { action: 'contact' })")
        expect(result).toContain("const security = { 'g-recaptcha-response': token }")
    })

    it('falls back to the submit action', () => {
        const result = recaptchaSnippet(endpoint, 'kontakt', { location: 'body', key: 'token', config: null })

        expect(result).toContain("{ action: 'submit' }")
    })

    it('places the token in a header', () => {
        const result = recaptchaSnippet(endpoint, 'kontakt', { location: 'header', key: 'x-captcha', config: null })

        expect(result).toContain("const securityHeaders = { 'x-captcha': token }")
        expect(result).toContain('...securityHeaders')
        expect(result).not.toContain('const security =')
    })
})

describe('timedTokenSnippet', () => {
    it('is valid JavaScript for every location', () => {
        for (const location of ['body', 'header', 'query'] as const) {
            expect(
                inlineScriptsParse(timedTokenSnippet(endpoint, scriptUrl, 'kontakt', { location, key: 'formToken' })),
            ).toBe(true)
        }
    })

    it('reuses the prefetched token once and never caches a failed prefetch', () => {
        const result = timedTokenSnippet(endpoint, scriptUrl, 'kontakt', { location: 'body', key: 'formToken' })

        expect(result.match(/getToken\(/g)).toHaveLength(3)
        expect(result).toContain("pendingToken = InboundForm.getToken('kontakt')")
        expect(result).toContain('pendingToken.catch(() => {})')
        expect(result).toContain('const prefetched = pendingToken')
        expect(result).toContain('pendingToken = null')
        expect(result).toContain('prefetched.catch(() => null)')
        expect(result).toContain("?? (await InboundForm.getToken('kontakt'))")
        expect(result.lastIndexOf('pendingToken = null')).toBeLessThan(result.indexOf('prefetched.catch'))
    })

    it('includes the client script and fetches one token per submission', () => {
        const result = timedTokenSnippet(endpoint, scriptUrl, 'kontakt', { location: 'query', key: 'formToken' })

        expect(result).toContain(`<script src="${scriptUrl}"></script>`)
        expect(result).toContain("InboundForm.getToken('kontakt')")
        expect(result).toContain('const securityQuery = `?formToken=${encodeURIComponent(token)}`')
        expect(result).toContain('response.status === 403')
    })

    it('places the token in the body', () => {
        const result = timedTokenSnippet(endpoint, scriptUrl, 'kontakt', { location: 'body', key: 'formToken' })

        expect(result).toContain('const security = { formToken: token }')
    })
})

describe('submission robustness', () => {
    const snippets = [
        honeypotSnippet(endpoint, 'kontakt', { key: 'website' }),
        recaptchaSnippet(endpoint, 'kontakt', { location: 'body', key: 'k', config: null }),
        timedTokenSnippet(endpoint, scriptUrl, 'kontakt', { location: 'body', key: 'k' }),
    ]

    it('throws when the response is not ok', () => {
        for (const snippet of [...snippets, exampleRequest(endpoint, fields)]) {
            expect(snippet).toContain('if (!response.ok)')
            expect(snippet).toContain('Submit failed with status')
        }
    })

    it('converts number and checkbox inputs instead of sending strings', () => {
        for (const snippet of snippets) {
            expect(snippet).toContain("element.type === 'checkbox'")
            expect(snippet).toContain('element.checked')
            expect(snippet).toContain("element.type === 'number'")
            expect(snippet).toContain('Number(element.value)')
            expect(snippet).not.toContain('Object.fromEntries')
        }
    })
})

describe('form scoping', () => {
    it('limits every snippet to the form marked with the slug', () => {
        const honeypot = honeypotSnippet(endpoint, 'kontakt', { key: 'website' })
        const recaptcha = recaptchaSnippet(endpoint, 'kontakt', { location: 'body', key: 'k', config: null })
        const timed = timedTokenSnippet(endpoint, scriptUrl, 'kontakt', { location: 'body', key: 'k' })

        expect(honeypot).toContain('<form data-inbound-form="kontakt">')
        for (const snippet of [honeypot, recaptcha, timed]) {
            expect(snippet).toContain(`event.target.matches('${guard}')`)
        }
        for (const snippet of [recaptcha, timed]) {
            expect(snippet).toContain('<form data-inbound-form="kontakt">')
        }
        expect(timed).toContain(`event.target.closest('${guard}')`)
    })
})
