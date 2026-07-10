import { InboundFormField } from './inbound-form-field.interface'
import { InboundFormReceiver } from './inbound-form-receiver.interface'
import { InboundFormSecurity } from './inbound-form-security.interface'

export interface InboundForm {
    inboundFormId: number
    domainId: number | null
    name: string
    slug: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
}

export interface InboundFormFull extends InboundForm {
    inboundFormFields: InboundFormField[]
    inboundFormReceivers: InboundFormReceiver[]
    inboundFormSecurity: InboundFormSecurity[]
}

export type InboundFormCreate = Omit<InboundForm, 'inboundFormId'>
