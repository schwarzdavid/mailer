export enum InboundFormTemplateStatus {
    DRAFT = 'draft',
    PUBLISHED = 'published',
}

export interface InboundFormTemplate {
    inboundFormTemplateId: number
    inboundFormReceiverId: number
    template: string
    status: InboundFormTemplateStatus
    version: number
    createdAt: Date
}

export type InboundFormTemplateCreate = Omit<InboundFormTemplate, 'inboundFormTemplateId'>
