export function formEndpointUrl(slug: string): string {
    return `${location.origin}/api/public/form/${slug}`
}
