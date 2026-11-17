import type { ClientOptions } from '../core/options.ts'
import { createFormClientInternal } from './form-client-internal.ts'
import type { FormClient } from './types.ts'

export function createFormClient(options: ClientOptions): FormClient {
    const internal = createFormClientInternal(options)
    return {
        getToken: (formKey) => internal.getToken(formKey),
        submit: (formKey, submission) => internal.submit(formKey, submission),
    }
}
