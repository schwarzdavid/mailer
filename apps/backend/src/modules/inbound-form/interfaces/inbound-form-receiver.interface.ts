export interface InboundFormReceiver {
    inboundFormReceiverId: number
    inboundFormId: number
    emailReceiver: string
    emailFrom: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
}

export type InboundFormReceiverCreate = Omit<InboundFormReceiver, 'inboundFormReceiverId'>
