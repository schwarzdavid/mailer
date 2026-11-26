const FORM_API_PATH = '/api/v1/forms'

export function formEndpointPath(formKey: string): string {
    return `${FORM_API_PATH}/${formKey}`
}

export function formBaseUrl(): string {
    return location.origin
}

export function formEndpointUrl(formKey: string): string {
    return `${location.origin}${formEndpointPath(formKey)}`
}
