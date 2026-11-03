export const composeVariables: readonly string[] = [
    'SITE_ADDRESS',
    'MAIL_HOSTNAME',
    'MAIL_PASSWORD',
    'IMAGE_TAG',
    'HTTP_PORT',
    'HTTPS_PORT',
    'SMTP_PUBLIC_PORT',
]

export const runtimeVariables: readonly string[] = ['NODE_EXTRA_CA_CERTS']

const variableRow = /^\|\s*`([A-Z][A-Z0-9_]+)`\s*\|/

export function documentedVariables(markdown: string): Set<string> {
    const names = new Set<string>()
    for (const line of markdown.split(/\r?\n/)) {
        const name = variableRow.exec(line)?.[1]
        if (name) names.add(name)
    }
    return names
}

export interface EnvDrift {
    missing: string[]
    stale: string[]
}

export function findDrift(documented: Set<string>, expected: Iterable<string>): EnvDrift {
    const expectedNames = new Set(expected)
    return {
        missing: [...expectedNames].filter((name) => !documented.has(name)).sort(),
        stale: [...documented].filter((name) => !expectedNames.has(name)).sort(),
    }
}
