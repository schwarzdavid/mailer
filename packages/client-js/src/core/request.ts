import { MailerError } from './mailer-error.ts'
import { DEFAULT_TIMEOUT_MS, resolveApiBase, type ClientOptions } from './options.ts'

export interface ResolvedRequestOptions {
    apiBase: string
    fetch: typeof fetch
    timeoutMs: number
}

export interface RequestInitJson {
    method: 'POST'
    headers?: Record<string, string>
    query?: Record<string, string>
    body?: unknown
    credentials?: RequestCredentials
}

export function resolveRequestOptions(options: ClientOptions): ResolvedRequestOptions {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new TypeError('timeoutMs must be a positive finite number')
    }
    return {
        apiBase: resolveApiBase(options.baseUrl),
        fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
        timeoutMs,
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractMessages(value: unknown): string[] {
    if (typeof value === 'string') {
        return [value]
    }
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string')
    }
    return []
}

async function toError(response: Response): Promise<MailerError> {
    let payload: unknown
    try {
        payload = JSON.parse(await response.text())
    } catch {
        payload = undefined
    }
    if (!isRecord(payload)) {
        return new MailerError({ status: response.status, messages: [] })
    }
    return new MailerError({
        status: response.status,
        code: typeof payload.code === 'string' ? payload.code : undefined,
        messages: extractMessages(payload.message),
        mailMessageId: typeof payload.mailMessageId === 'number' ? payload.mailMessageId : undefined,
    })
}

function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
    if (typeof AbortSignal.timeout === 'function') {
        return { signal: AbortSignal.timeout(ms), clear: () => undefined }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
        controller.abort(new DOMException('The operation timed out', 'TimeoutError'))
    }, ms)
    return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

function withoutContentType(headers: Record<string, string> | undefined): Record<string, string> {
    return Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => name.toLowerCase() !== 'content-type'))
}

export async function requestJson<T>(options: ResolvedRequestOptions, path: string, init: RequestInitJson): Promise<T> {
    const search = init.query ? `?${new URLSearchParams(init.query).toString().replace(/\+/g, '%20')}` : ''
    const headers: Record<string, string> =
        init.body === undefined
            ? { ...init.headers }
            : { ...withoutContentType(init.headers), 'Content-Type': 'application/json' }

    const { signal, clear } = timeoutSignal(options.timeoutMs)
    const send = options.fetch
    try {
        let response: Response
        try {
            response = await send(`${options.apiBase}${path}${search}`, {
                method: init.method,
                headers,
                body: init.body === undefined ? undefined : JSON.stringify(init.body),
                credentials: init.credentials,
                signal,
            })
        } catch (cause) {
            throw new MailerError({ status: 0, messages: [], cause })
        }

        if (!response.ok) {
            throw await toError(response)
        }
        try {
            return (await response.json()) as T
        } catch (cause) {
            throw new MailerError({ status: signal.aborted ? 0 : response.status, messages: [], cause })
        }
    } finally {
        clear()
    }
}
