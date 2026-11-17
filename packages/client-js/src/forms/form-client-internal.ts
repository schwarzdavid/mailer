import type { ClientOptions } from '../core/options.ts'
import { requestJson, resolveRequestOptions } from '../core/request.ts'
import type { FormClient, FormSubmission, FormSubmitResult, FormValues, IssuedToken } from './types.ts'

interface TokenResponseBody {
    token: string
    notBefore: string
    expiresAt: string
    waitMs: number
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface InternalFormClient extends FormClient {
    issueToken(formKey: string): Promise<IssuedToken>
}

export function createFormClientInternal(options: ClientOptions): InternalFormClient {
    const resolved = resolveRequestOptions(options)
    const pending = new Map<string, Promise<IssuedToken>>()

    async function requestToken(formKey: string): Promise<IssuedToken> {
        const body = await requestJson<TokenResponseBody>(resolved, `/forms/${encodeURIComponent(formKey)}/token`, {
            method: 'POST',
            credentials: 'omit',
        })
        const receivedAt = Date.now()
        const waitMs = Math.max(0, Number(body.waitMs) || 0)
        await wait(waitMs)
        return {
            token: body.token,
            notBefore: new Date(body.notBefore),
            expiresAt: new Date(body.expiresAt),
            waitMs,
            receivedAt,
        }
    }

    function issueToken(formKey: string): Promise<IssuedToken> {
        return requestToken(formKey)
    }

    async function getToken(formKey: string): Promise<string> {
        let request = pending.get(formKey)
        if (!request) {
            const created = requestToken(formKey).finally(() => {
                pending.delete(formKey)
            })
            pending.set(formKey, created)
            request = created
        }
        return (await request).token
    }

    function submit<TData extends FormValues = FormValues, TSecurity extends FormValues = FormValues>(
        formKey: string,
        submission: FormSubmission<TData, TSecurity>,
    ): Promise<FormSubmitResult> {
        return requestJson<FormSubmitResult>(resolved, `/forms/${encodeURIComponent(formKey)}`, {
            method: 'POST',
            headers: submission.headers,
            query: submission.query,
            body: { data: submission.data, security: submission.security },
            credentials: 'omit',
        })
    }

    return { getToken, issueToken, submit }
}
