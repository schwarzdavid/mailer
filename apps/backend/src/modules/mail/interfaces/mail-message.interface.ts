export enum MailMessageSource {
    API = 'api',
    INBOUND_FORM = 'inbound_form',
}

export enum MailMessageStatus {
    PENDING = 'pending',
    SENT = 'sent',
    FAILED = 'failed',
    BLOCKED = 'blocked',
}

export interface MailMessage {
    mailMessageId: number
    projectId: number | null
    source: MailMessageSource
    apiKeyId: number | null
    emailFrom: string
    emailTo: string
    subject: string
    status: MailMessageStatus
    error: string | null
    smtpMessageId: string | null
    sentAt: Date | null
    createdAt: Date
    updatedAt: Date
}

export type MailMessageCreate = Omit<MailMessage, 'mailMessageId' | 'createdAt' | 'updatedAt'>

export interface MailMessageQuery {
    page: number
    itemsPerPage: number
    search?: string
    source?: MailMessageSource
    status?: MailMessageStatus
}

export interface MailMessagePage {
    items: MailMessage[]
    total: number
}
