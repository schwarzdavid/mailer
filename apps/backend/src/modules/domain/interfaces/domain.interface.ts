export interface Domain {
    domainId: number
    fqdn: string
}

export type DomainCreate = Pick<Domain, 'fqdn'>
