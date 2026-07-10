export enum InboundFormFieldType {
    TEXT = 'text',
    EMAIL = 'email',
    NUMBER = 'number',
    BOOLEAN = 'boolean',
}

export interface InboundFormFieldValidation {
    required?: boolean
    minLength?: number
    maxLength?: number
    pattern?: string
    min?: number
    max?: number
}

export interface InboundFormField {
    inboundFormFieldId: number
    inboundFormId: number
    key: string
    label: string
    type: InboundFormFieldType
    defaultValue: string | null
    validation: InboundFormFieldValidation | null
    createdAt: Date
    updatedAt: Date
}

export type InboundFormFieldCreate = Omit<InboundFormField, 'inboundFormFieldId' | 'createdAt' | 'updatedAt'>

export type InboundFormFieldUpsert = Omit<InboundFormFieldCreate, 'inboundFormId'>
