const VOID_ELEMENTS = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'source',
    'track',
    'wbr',
])

const OPEN_TAG = /<([a-zA-Z][\w:-]*)(?:\s(?:[^<>"']|"[^"]*"|'[^']*')*)?>$/

export function closingTagFor(textBeforeCursor: string): string | null {
    if (textBeforeCursor.endsWith('/>')) {
        return null
    }
    const match = OPEN_TAG.exec(textBeforeCursor)
    const tag = match?.[1]
    if (!tag || VOID_ELEMENTS.has(tag.toLowerCase())) {
        return null
    }
    return `</${tag}>`
}
