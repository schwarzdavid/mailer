const FORM_API_PATH = '/api/v1/forms'

export function formEndpointPath(formKey: string): string {
    return `${FORM_API_PATH}/${formKey}`
}

export function formEndpointUrl(formKey: string): string {
    return `${location.origin}${formEndpointPath(formKey)}`
}

export function formClientScriptUrl(): string {
    return `${location.origin}${FORM_API_PATH}/client.js`
}
