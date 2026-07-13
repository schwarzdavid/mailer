export enum BounceType {
    PERMANENT = 'permanent',
    TRANSIENT = 'transient',
}

export interface Bounce {
    bounceId: number
    emailAddress: string
    type: BounceType
    statusCode: string | null
    reason: string
    messageId: string | null
    receivedAt: Date
    createdAt: Date
    updatedAt: Date
}

export type BounceCreate = Omit<Bounce, 'bounceId' | 'createdAt' | 'updatedAt'>
