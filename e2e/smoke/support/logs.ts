function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

export function setupTokenFrom(log: string): string | undefined {
    const matches = [...log.matchAll(/Setup token: ([0-9a-f]{32})(?![0-9a-f])/g)]
    return matches[matches.length - 1]?.[1]
}

export function requestLogEntry(log: string, reqId: string, url: string): Record<string, unknown> | undefined {
    for (const line of log.split('\n')) {
        if (!line.startsWith('{')) {
            continue
        }
        let parsed: unknown
        try {
            parsed = JSON.parse(line)
        } catch {
            continue
        }
        if (!isRecord(parsed)) {
            continue
        }
        const req = parsed.req
        if (parsed.reqId === reqId && isRecord(req) && req.url === url) {
            return parsed
        }
    }
    return undefined
}

export function lastWord(output: string): string {
    const nonEmptyLines = output.split('\n').filter((line) => line.trim() !== '')
    const lastLine = nonEmptyLines[nonEmptyLines.length - 1] ?? ''
    const words = lastLine.trim().split(/\s+/)
    return words[words.length - 1] ?? ''
}
