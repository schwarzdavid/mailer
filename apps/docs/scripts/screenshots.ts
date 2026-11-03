const markdownImage = /!\[[^\]]*\]\((\/screenshots\/[^)\s]+\.png)\)/g

export function screenshotReferences(markdown: string): string[] {
    return [...markdown.matchAll(markdownImage)].map((match) => match[1] ?? '')
}
