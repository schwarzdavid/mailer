export function formEndpointUrl(slug: string): string {
    return `${location.origin}/api/public/form/${slug}`
}

export function formClientScriptUrl(): string {
    return `${location.origin}/api/public/form/client.js`
}
