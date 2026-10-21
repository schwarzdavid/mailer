const LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
export const MAX_HOSTNAME_LENGTH = 253
export const ALLOWED_HOSTNAMES_COMMENT =
    'Hostnames are capped at 253 characters: the DNS limit of 255 octets (RFC 1035) includes one length octet per label and the terminating root octet, which leaves 253 for the dotted text form.'

export function normalizeHostname(value: string): string | null {
    const hostname = value.trim().toLowerCase()
    if (hostname.length === 0 || hostname.length > MAX_HOSTNAME_LENGTH) {
        return null
    }
    return hostname.split('.').every((label) => LABEL_PATTERN.test(label)) ? hostname : null
}
