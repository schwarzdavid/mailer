export const proceduralPages: readonly string[] = [
    'installation/prepare-server.md',
    'installation/dns.md',
    'installation/docker-compose.md',
    'installation/first-run-setup.md',
    'installation/verify.md',
    'installation/going-live.md',
    'configuration/external-postgres-redis.md',
    'configuration/without-docker.md',
    'admin-guide/domains.md',
    'admin-guide/inbound-forms/embed.md',
    'admin-guide/send-api.md',
    'admin-guide/settings.md',
    'operations/updating.md',
    'operations/rollback.md',
    'operations/backup-restore.md',
    'operations/rotating-secrets.md',
]

const fence = /^---\r?$/

export function stripFrontmatter(markdown: string): string {
    const lines = markdown.split('\n')
    const first = lines[0]
    if (first === undefined || !fence.test(first)) return markdown
    const end = lines.findIndex((line, index) => index > 0 && fence.test(line))
    if (end === -1) return markdown
    return lines.slice(end + 1).join('\n')
}

export function startsWithHeading(markdown: string): boolean {
    const firstLine = stripFrontmatter(markdown)
        .split('\n')
        .find((line) => line.trim() !== '')
    return firstLine !== undefined && firstLine.startsWith('# ')
}

export function hasVerifySection(markdown: string): boolean {
    return markdown.split('\n').some((line) => line.replace(/\r$/, '') === '## How you know it worked')
}
