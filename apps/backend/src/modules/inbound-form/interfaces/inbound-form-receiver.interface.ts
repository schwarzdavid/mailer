export interface InboundFormReceiver {
    inboundFormReceiverId: string
    inboundFormId: string
    emailReceiver: string
    emailFrom: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
}

export type InboundFormReceiverCreate = Omit<InboundFormReceiver, 'inboundFormReceiverId'>
