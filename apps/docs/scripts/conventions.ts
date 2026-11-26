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
