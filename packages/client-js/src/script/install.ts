import { createFormClient } from '../forms/form-client.ts'
import { MailerForm, type MailerFormOptions } from '../forms/mailer-form.ts'
import type { FormClient, FormSubmission, FormSubmitResult, FormValues } from '../forms/types.ts'

type InboundFormMailerFormOptions = Omit<MailerFormOptions, 'baseUrl'> & Partial<Pick<MailerFormOptions, 'baseUrl'>>

export interface InboundFormGlobal extends FormClient {
    MailerForm: new (options: InboundFormMailerFormOptions) => MailerForm
}

const SCRIPT_PATH = /\/api\/v1\/forms\/client\.js(?:[?#].*)?$/

export function installInboundForm(target: { InboundForm?: unknown }, scriptSrc: string | null | undefined): void {
    const baseUrl = (scriptSrc ?? '').replace(SCRIPT_PATH, '')
    let client: FormClient | undefined

    function formClient(): FormClient {
        client ??= createFormClient({ baseUrl })
        return client
    }

    class ScriptMailerForm extends MailerForm {
        constructor(options: InboundFormMailerFormOptions) {
            super({ ...options, baseUrl: options.baseUrl ?? baseUrl })
        }
    }

    const global: InboundFormGlobal = {
        async getToken(formKey: string): Promise<string> {
            return formClient().getToken(formKey)
        },
        async submit<TData extends FormValues, TSecurity extends FormValues>(
            formKey: string,
            submission: FormSubmission<TData, TSecurity>,
        ): Promise<FormSubmitResult> {
            return formClient().submit(formKey, submission)
        },
        MailerForm: ScriptMailerForm,
    }

    target.InboundForm = global
}
