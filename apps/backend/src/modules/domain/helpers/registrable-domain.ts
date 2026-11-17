import { parse } from 'tldts'

export function registrableDomainOf(hostname: string): string | null {
    return parse(hostname.toLowerCase()).domain
}
