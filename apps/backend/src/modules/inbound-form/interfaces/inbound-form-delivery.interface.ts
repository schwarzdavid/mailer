export enum InboundFormDeliveryStatus {
    PENDING = 'pending',
    SENT = 'sent',
    FAILED = 'failed',
}

export interface InboundFormDelivery {
    inboundFormDeliveryId: number
    inboundFormSubmissionId: number
    inboundFormReceiverId: number | null
    inboundFormTemplateId: number | null
    emailFrom: string
    emailTo: string
    status: InboundFormDeliveryStatus
    error: string | null
    sentAt: Date | null
    createdAt: Date
    updatedAt: Date
}

export type InboundFormDeliveryCreate = Omit<InboundFormDelivery, 'inboundFormDeliveryId' | 'createdAt' | 'updatedAt'>
