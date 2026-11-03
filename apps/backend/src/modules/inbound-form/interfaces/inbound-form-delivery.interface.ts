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
    attempts: number
    error: string | null
    sentAt: Date | null
    mailMessageId: number | null
    createdAt: Date
    updatedAt: Date
}

export type InboundFormDeliveryCreate = Omit<InboundFormDelivery, 'inboundFormDeliveryId' | 'createdAt' | 'updatedAt'>
