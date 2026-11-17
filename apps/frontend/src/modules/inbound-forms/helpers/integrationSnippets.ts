import type { InboundFormDetailDto, InboundFormFieldDto, InboundFormSecurityDto } from 'api'
import { buildSampleData } from '@/modules/inbound-forms/helpers/sampleData.ts'

const CLIENT_PACKAGE = '@schwarzdavid/mailer-client'
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

type TimedTokenScheme = Pick<InboundFormSecurityDto, 'key' | 'location'>

function propertyKey(key: string): string {
    return IDENTIFIER.test(key) ? key : `'${key}'`
}

export function installCommand(): string {
    return `npm install ${CLIENT_PACKAGE}`
}

export function clientImport(): string {
    return `import { MailerForm } from '${CLIENT_PACKAGE}'`
}

function constructionOptions(options: string[], timedToken?: TimedTokenScheme): string {
    const lines = [...options]
    if (timedToken) {
        lines.push(`timedToken: { key: '${timedToken.key}', location: '${timedToken.location}' }`)
    }
    return lines.map((line) => `    ${line},`).join('\n')
}

export function formConstruction(baseUrl: string, formKey: string, timedToken?: TimedTokenScheme): string {
    const options = constructionOptions([`baseUrl: '${baseUrl}'`, `formKey: '${formKey}'`], timedToken)
    return `const form = new MailerForm({\n${options}\n})`
}

export function scriptTagConstruction(formKey: string, timedToken?: TimedTokenScheme): string {
    const options = constructionOptions([`formKey: '${formKey}'`], timedToken)
    return `const form = new InboundForm.MailerForm({\n${options}\n})`
}

export function exampleRequest(
    baseUrl: string,
    formKey: string,
    fields: InboundFormFieldDto[],
    timedToken?: TimedTokenScheme,
): string {
    const sample = JSON.stringify(buildSampleData(fields), null, 4)
    return [
        clientImport(),
        '',
        formConstruction(baseUrl, formKey, timedToken),
        '',
        `const data = ${sample}`,
        '',
        'await form.submit({ data })',
    ].join('\n')
}

export function scriptTag(src: string): string {
    return `<script src="${src}"></script>`
}

export function inlineScript(code: string): string {
    return `<script>\n${code}\n</script>`
}

export function securityPlacement(
    scheme: Pick<InboundFormSecurityDto, 'location' | 'key'>,
    valueExpression: string,
): string {
    switch (scheme.location) {
        case 'header':
            return `await form.submit({ data, headers: { '${scheme.key}': ${valueExpression} } })`
        case 'query':
            return `await form.submit({ data, query: { ${propertyKey(scheme.key)}: ${valueExpression} } })`
        default:
            return `await form.submit({ data, security: { ${propertyKey(scheme.key)}: ${valueExpression} } })`
    }
}

export function timedTokenSchemeOf(form: Pick<InboundFormDetailDto, 'security'>): InboundFormSecurityDto | undefined {
    return form.security.find((scheme) => scheme.type === 'timed-token')
}

export function createFormSnippet(baseUrl: string, form: Pick<InboundFormDetailDto, 'formKey' | 'security'>): string {
    return [
        installCommand(),
        clientImport(),
        '',
        formConstruction(baseUrl, form.formKey, timedTokenSchemeOf(form)),
    ].join('\n')
}
