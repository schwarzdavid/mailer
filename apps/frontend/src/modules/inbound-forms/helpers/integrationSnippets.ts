import type { InboundFormFieldDto, InboundFormSecurityDto } from 'api'
import { buildSampleData } from '@/modules/inbound-forms/helpers/sampleData.ts'

type Placement = Pick<InboundFormSecurityDto, 'location' | 'key'>

interface SubmitCall {
    url: string
    securityLines: string[]
    headersExpression: string
    bodyExpression: string
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

const PLAIN_SUBMIT: SubmitCall = {
    url: '',
    securityLines: [],
    headersExpression: "{ 'Content-Type': 'application/json' }",
    bodyExpression: 'JSON.stringify({ data })',
}

function propertyKey(key: string): string {
    return IDENTIFIER.test(key) ? key : `'${key}'`
}

function placeToken(endpoint: string, scheme: Placement, valueExpression: string): SubmitCall {
    switch (scheme.location) {
        case 'header':
            return {
                ...PLAIN_SUBMIT,
                url: `'${endpoint}'`,
                securityLines: [`const securityHeaders = { '${scheme.key}': ${valueExpression} }`],
                headersExpression: "{ 'Content-Type': 'application/json', ...securityHeaders }",
            }
        case 'query':
            return {
                ...PLAIN_SUBMIT,
                url: `\`${endpoint}\${securityQuery}\``,
                securityLines: [`const securityQuery = \`?${scheme.key}=\${encodeURIComponent(${valueExpression})}\``],
            }
        default:
            return {
                ...PLAIN_SUBMIT,
                url: `'${endpoint}'`,
                securityLines: [`const security = { ${propertyKey(scheme.key)}: ${valueExpression} }`],
                bodyExpression: 'JSON.stringify({ data, security })',
            }
    }
}

function indented(lines: string[], indent: string): string[] {
    return lines.map((line) => (line === '' ? line : `${indent}${line}`))
}

function submitStatements(call: SubmitCall, indent: string): string[] {
    return indented(
        [
            ...call.securityLines,
            `const response = await fetch(${call.url}, {`,
            `    method: 'POST',`,
            `    headers: ${call.headersExpression},`,
            `    body: ${call.bodyExpression},`,
            '})',
        ],
        indent,
    )
}

function okCheck(indent: string): string[] {
    return indented(
        ['if (!response.ok) {', '    throw new Error(`Submit failed with status ${response.status}`)', '}'],
        indent,
    )
}

function formSelector(slug: string): string {
    return `form[data-inbound-form="${slug}"]`
}

function formHint(slug: string): string {
    return `<!-- Your form needs the attribute: <form data-inbound-form="${slug}"> -->`
}

const READ_FORM_HELPER: string[] = [
    '    function readForm(form) {',
    '        const data = {}',
    '        for (const element of form.elements) {',
    "            const skipped = element.type === 'submit' || element.type === 'button'",
    "            if (!element.name || skipped || (element.type === 'radio' && !element.checked)) {",
    '                continue',
    '            }',
    "            if (element.type === 'checkbox') {",
    '                data[element.name] = element.checked',
    "            } else if (element.type === 'number') {",
    "                data[element.name] = element.value === '' ? undefined : Number(element.value)",
    '            } else {',
    '                data[element.name] = element.value',
    '            }',
    '        }',
    '        return data',
    '    }',
    '',
]

function submitHead(slug: string): string[] {
    return [
        `    document.addEventListener('submit', async (event) => {`,
        `        if (!event.target.matches('${formSelector(slug)}')) {`,
        '            return',
        '        }',
        '        event.preventDefault()',
        '        const form = event.target',
        '        const data = readForm(form)',
    ]
}

export function exampleRequest(endpoint: string, fields: InboundFormFieldDto[]): string {
    const sample = JSON.stringify(buildSampleData(fields), null, 4)
    return [
        `const data = ${sample}`,
        '',
        ...submitStatements({ ...PLAIN_SUBMIT, url: `'${endpoint}'` }, ''),
        ...okCheck(''),
    ].join('\n')
}

export function honeypotSnippet(endpoint: string, slug: string, scheme: Pick<InboundFormSecurityDto, 'key'>): string {
    const call: SubmitCall = {
        ...PLAIN_SUBMIT,
        url: `'${endpoint}'`,
        securityLines: [`const security = { ${propertyKey(scheme.key)}: form.elements['${scheme.key}'].value }`],
        bodyExpression: 'JSON.stringify({ data, security })',
    }
    return [
        '<style>',
        '    .hp-field {',
        '        position: absolute;',
        '        left: -9999px;',
        '    }',
        '</style>',
        '',
        `<form data-inbound-form="${slug}">`,
        '    <input name="email" type="email">',
        `    <input name="${scheme.key}" tabindex="-1" autocomplete="off" class="hp-field">`,
        '    <button>Send</button>',
        '</form>',
        '',
        '<script>',
        ...READ_FORM_HELPER,
        ...submitHead(slug),
        `        delete data['${scheme.key}']`,
        ...submitStatements(call, '        '),
        ...okCheck('        '),
        '    })',
        '</script>',
    ].join('\n')
}

export function recaptchaSnippet(
    endpoint: string,
    slug: string,
    scheme: Pick<InboundFormSecurityDto, 'location' | 'key' | 'config'>,
): string {
    const action = scheme.config?.expectedAction || 'submit'
    const call = placeToken(endpoint, scheme, 'token')
    return [
        formHint(slug),
        '<script src="https://www.google.com/recaptcha/api.js?render=SITE_KEY"></script>',
        '<script>',
        ...READ_FORM_HELPER,
        ...submitHead(slug),
        '        await new Promise((resolve) => grecaptcha.ready(resolve))',
        `        const token = await grecaptcha.execute('SITE_KEY', { action: '${action}' })`,
        ...submitStatements(call, '        '),
        ...okCheck('        '),
        '    })',
        '</script>',
    ].join('\n')
}

export function timedTokenSnippet(
    endpoint: string,
    scriptUrl: string,
    slug: string,
    scheme: Pick<InboundFormSecurityDto, 'location' | 'key'>,
): string {
    const call = placeToken(endpoint, scheme, 'token')
    return [
        formHint(slug),
        `<script src="${scriptUrl}"></script>`,
        '<script>',
        '    let pendingToken = null',
        `    document.addEventListener('focusin', (event) => {`,
        `        if (pendingToken || !event.target.closest('${formSelector(slug)}')) {`,
        '            return',
        '        }',
        `        pendingToken = InboundForm.getToken('${slug}')`,
        '        pendingToken.catch(() => {})',
        '    })',
        '',
        ...READ_FORM_HELPER,
        '    async function send(data, token) {',
        ...submitStatements(call, '        '),
        '        return response',
        '    }',
        '',
        ...submitHead(slug),
        '        const prefetched = pendingToken',
        '        pendingToken = null',
        '        const prefetchedToken = prefetched ? await prefetched.catch(() => null) : null',
        `        const token = prefetchedToken ?? (await InboundForm.getToken('${slug}'))`,
        '        let response = await send(data, token)',
        '        if (response.status === 403) {',
        `            response = await send(data, await InboundForm.getToken('${slug}'))`,
        '        }',
        ...okCheck('        '),
        '    })',
        '</script>',
    ].join('\n')
}
