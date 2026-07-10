const PLACEHOLDER_PATTERN = /^\{\{\s*([\w-]+)\s*\}\}$/

export function parsePlaceholder(value: string): string | null {
    const match = PLACEHOLDER_PATTERN.exec(value)
    return match?.[1] ?? null
}
