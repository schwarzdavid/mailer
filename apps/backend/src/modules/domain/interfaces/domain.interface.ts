import { DomainDkim } from './domain-dkim.interface'

export interface Domain {
    domainId: number
    fqdn: string
    activeDkimId: number
}

export interface DomainWithDkim extends Domain {
    activeDkim: DomainDkim,
    dkims: DomainDkim[]
}

export type DomainCreate = Pick<Domain, 'fqdn'>
