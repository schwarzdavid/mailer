import type { BOUNCE_SORT_FIELDS, SORT_ORDERS } from '../bounce.constants.js'

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

export type BounceSortField = (typeof BOUNCE_SORT_FIELDS)[number]

export type SortOrder = (typeof SORT_ORDERS)[number]

export interface BounceQuery {
    page: number
    itemsPerPage: number
    search?: string
    type?: BounceType
    receivedAfter?: Date
    sortBy: BounceSortField
    sortOrder: SortOrder
}

export interface BouncePage {
    items: Bounce[]
    total: number
}
