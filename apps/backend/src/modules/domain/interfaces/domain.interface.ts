export interface Domain {
    domainId: number
    fqdn: string
    activeDkimId: number
}

export type DomainCreate = Pick<Domain, 'fqdn'>
