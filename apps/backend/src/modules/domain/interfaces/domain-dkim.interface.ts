export enum DomainDkimAlgorithm {
    RSA = 'rsa',
}

export type DomainDkimKeyBits = 2048

export interface DomainDkim {
    dkimId: number
    domainId: number
    selector: string
    publicKey: string
    privateKey: string
    algorithm: DomainDkimAlgorithm
    keyBits: DomainDkimKeyBits
    createdAt: Date
}

export type DomainDkimCreate = Omit<DomainDkim, 'dkimId' | 'createdAt' | 'updatedAt'>
