export enum InboundFormTemplateStatus {
    DRAFT = 'draft',
    PUBLISHED = 'published',
}

export interface InboundFormTemplate {
    inboundFormTemplateId: number
    inboundFormReceiverId: number
    subject: string
    template: string
    status: InboundFormTemplateStatus
    version: number
    createdAt: Date
    updatedAt: Date
}

export type InboundFormTemplateCreate = Omit<InboundFormTemplate, 'inboundFormTemplateId' | 'createdAt' | 'updatedAt'>

export interface InboundFormTemplateDraft {
    subject: string
    template: string
}

export interface InboundFormTemplateSummary {
    draftVersion: number | null
    publishedVersion: number | null
}
