export class DomainNotReadyError extends Error {
    constructor(
        readonly domainId: number,
        readonly fqdn: string,
    ) {
        super(`Domain ${domainId} (${fqdn}) has DNS records that are not valid yet`)
        this.name = 'DomainNotReadyError'
    }
}
