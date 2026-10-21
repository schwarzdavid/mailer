import type { InboundFormFieldDto, InboundFormSecurityDto } from 'api'
import { buildSampleData } from '@/modules/inbound-forms/helpers/sampleData.ts'

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

function propertyKey(key: string): string {
    return IDENTIFIER.test(key) ? key : `'${key}'`
}

export function exampleRequest(endpoint: string, fields: InboundFormFieldDto[]): string {
    const sample = JSON.stringify(buildSampleData(fields), null, 4)
    return [
        `const data = ${sample}`,
        '',
        `const response = await fetch('${endpoint}', {`,
        `    method: 'POST',`,
        `    headers: { 'Content-Type': 'application/json' },`,
        `    body: JSON.stringify({ data }),`,
        '})',
        'if (!response.ok) {',
        '    throw new Error(`Submit failed with status ${response.status}`)',
        '}',
    ].join('\n')
}

export function scriptTag(src: string): string {
    return `<script src="${src}"></script>`
}

export function securityPlacement(
    endpoint: string,
    scheme: Pick<InboundFormSecurityDto, 'location' | 'key'>,
    valueExpression: string,
): string {
    switch (scheme.location) {
        case 'header':
            return `headers: { 'Content-Type': 'application/json', '${scheme.key}': ${valueExpression} }`
        case 'query':
            return `fetch(\`${endpoint}?${scheme.key}=\${encodeURIComponent(${valueExpression})}\`, …)`
        default:
            return `body: JSON.stringify({ data, security: { ${propertyKey(scheme.key)}: ${valueExpression} } })`
    }
}
