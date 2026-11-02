interface SpecOperation {
    tags?: string[]
}

interface SpecWithPaths {
    paths: Record<string, Record<string, SpecOperation>>
}

export function specTags(spec: SpecWithPaths): string[] {
    const tags = Object.values(spec.paths).flatMap((operations) =>
        Object.values(operations).flatMap((operation) => operation.tags ?? []),
    )
    return [...new Set(tags)].sort()
}

export function pageTag(markdown: string): string | null {
    return /<OASpec\b[^>]*:tags="\['([^']+)'\]"/.exec(markdown)?.[1] ?? null
}
