export interface InboundFormReceiver {
    inboundFormReceiverId: number
    inboundFormId: number
    emailReceiver: string
    emailReplyTo: string | null
    emailFrom: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
}

export type InboundFormReceiverCreate = Omit<InboundFormReceiver, 'inboundFormReceiverId' | 'createdAt' | 'updatedAt'>

export type InboundFormReceiverUpsert = Omit<InboundFormReceiverCreate, 'inboundFormId'>
