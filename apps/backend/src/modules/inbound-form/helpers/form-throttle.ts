import { SetMetadata, type ExecutionContext } from '@nestjs/common'

export const FORM_SUBMIT_THROTTLER = 'formSubmit'

export const FORM_TOKEN_THROTTLER = 'formToken'

export const FORM_THROTTLE_KEY = Symbol('FORM_THROTTLE_KEY')

export type FormThrottleKind = 'submit' | 'token'

export interface FormThrottleRequest {
    ip?: string
    params?: Record<string, string>
}

export const FormThrottle = (kind: FormThrottleKind) => SetMetadata(FORM_THROTTLE_KEY, kind)

export function formThrottleKind(context: ExecutionContext): FormThrottleKind | null {
    const kind: unknown = Reflect.getMetadata(FORM_THROTTLE_KEY, context.getHandler())
    return kind === 'submit' || kind === 'token' ? kind : null
}

export function formThrottleTracker(request: FormThrottleRequest): string {
    return `form:${request.params?.slug ?? 'unknown'}:${request.ip ?? 'unknown'}`
}
