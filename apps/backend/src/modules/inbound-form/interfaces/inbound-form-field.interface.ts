export interface InboundFormField {
    inboundFormFieldId: number
    inboundFormId: number
    key: string
    label: string
    defaultValue: string | null
    validation: string | null
    createdAt: Date
    updatedAt: Date
}

export type InboundFormFieldCreate = Omit<InboundFormField, 'inboundFormFieldId'>
