import { MailerError } from '../core/mailer-error.ts'
import { resolveApiBase, type ClientOptions } from '../core/options.ts'
import { createFormClientInternal, type InternalFormClient } from './form-client-internal.ts'
import type { FormSubmission, FormSubmitResult, FormValues, IssuedToken, TimedTokenPlacement } from './types.ts'

export interface MailerFormOptions extends ClientOptions {
    formKey: string
    timedToken?: TimedTokenPlacement
}

interface CachedToken {
    request: Promise<IssuedToken>
    issued?: IssuedToken
}

const EXPIRY_MARGIN_MS = 5000

const REJECTED_BEFORE_CONSUMING_TOKEN = new Set([400, 404, 413, 429])

function isExpired(issued: IssuedToken): boolean {
    const lifetimeMs = issued.expiresAt.getTime() - issued.notBefore.getTime()
    return Date.now() > issued.receivedAt + issued.waitMs + lifetimeMs - EXPIRY_MARGIN_MS
}

export class MailerForm<TData extends FormValues = FormValues, TSecurity extends FormValues = FormValues> {
    readonly formKey: string
    readonly #client: InternalFormClient
    readonly #timedToken: TimedTokenPlacement | undefined
    #cached: CachedToken | undefined

    constructor(options: MailerFormOptions) {
        resolveApiBase(options.baseUrl)
        this.#timedToken = options.timedToken
        this.formKey = options.formKey
        this.#client = createFormClientInternal(options)
    }

    prepare(): void {
        if (this.#timedToken) {
            this.#ensureToken()
        }
    }

    async submit(submission: FormSubmission<TData, TSecurity>): Promise<FormSubmitResult> {
        const placement = this.#timedToken
        if (!placement) {
            return this.#client.submit(this.formKey, submission)
        }
        const cached = this.#ensureToken()
        this.#cached = undefined
        const { token } = await cached.request
        try {
            return await this.#client.submit(this.formKey, placeToken(submission, placement, token))
        } catch (error) {
            if (error instanceof MailerError && REJECTED_BEFORE_CONSUMING_TOKEN.has(error.status) && !this.#cached) {
                this.#cached = cached
            }
            throw error
        }
    }

    #ensureToken(): CachedToken {
        if (this.#cached && !(this.#cached.issued && isExpired(this.#cached.issued))) {
            return this.#cached
        }
        const cached: CachedToken = {
            request: this.#client.issueToken(this.formKey).then((issued) => {
                cached.issued = issued
                return issued
            }),
        }
        cached.request.catch(() => {
            if (this.#cached === cached) {
                this.#cached = undefined
            }
        })
        this.#cached = cached
        return cached
    }
}

function placeToken<TData extends FormValues, TSecurity extends FormValues>(
    submission: FormSubmission<TData, TSecurity>,
    placement: TimedTokenPlacement,
    token: string,
): FormSubmission<TData, FormValues> {
    const { key, location } = placement
    if (location === 'header') {
        const headers = Object.fromEntries(
            Object.entries(submission.headers ?? {}).filter(([name]) => name.toLowerCase() !== key.toLowerCase()),
        )
        return { ...submission, headers: { ...headers, [key]: token } }
    }
    if (location === 'query') {
        return { ...submission, query: { ...submission.query, [key]: token } }
    }
    return { ...submission, security: { ...submission.security, [key]: token } }
}
