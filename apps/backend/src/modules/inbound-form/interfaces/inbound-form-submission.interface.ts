export enum InboundFormSubmissionStatus {
    ACCEPTED = 'accepted',
    SPAM = 'spam',
}

export interface InboundFormSubmission {
    inboundFormSubmissionId: number
    inboundFormId: number
    data: Record<string, unknown>
    status: InboundFormSubmissionStatus
    createdAt: Date
}

export type InboundFormSubmissionCreate = Omit<InboundFormSubmission, 'inboundFormSubmissionId' | 'createdAt'>
