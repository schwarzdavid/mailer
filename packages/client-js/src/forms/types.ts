export type FormValues = Record<string, unknown>

export interface FormSubmission<TData extends FormValues = FormValues, TSecurity extends FormValues = FormValues> {
    data: TData
    security?: TSecurity
    headers?: Record<string, string>
    query?: Record<string, string>
}

export interface FormSubmitResult {
    status: 'accepted'
}

export type SecurityLocation = 'body' | 'header' | 'query'

export interface TimedTokenPlacement {
    key: string
    location: SecurityLocation
}

export interface IssuedToken {
    token: string
    notBefore: Date
    expiresAt: Date
    waitMs: number
    receivedAt: number
}

export interface FormClient {
    getToken(formKey: string): Promise<string>
    submit<TData extends FormValues = FormValues, TSecurity extends FormValues = FormValues>(
        formKey: string,
        submission: FormSubmission<TData, TSecurity>,
    ): Promise<FormSubmitResult>
}
