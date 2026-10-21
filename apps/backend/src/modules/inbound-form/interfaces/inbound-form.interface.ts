import { InboundFormField } from './inbound-form-field.interface.js'
import { InboundFormReceiver } from './inbound-form-receiver.interface.js'
import { InboundFormSecurity } from './inbound-form-security.interface.js'

export interface InboundForm {
    inboundFormId: number
    projectId: number
    domainId: number | null
    name: string
    slug: string
    isActive: boolean
    allowedHostnames: string[]
    createdAt: Date
    updatedAt: Date
}

export interface InboundFormWithReceivers extends InboundForm {
    inboundFormReceivers: InboundFormReceiver[]
}

export interface InboundFormFull extends InboundForm {
    inboundFormFields: InboundFormField[]
    inboundFormReceivers: InboundFormReceiver[]
    inboundFormSecurity: InboundFormSecurity[]
}

export type InboundFormCreate = Omit<InboundForm, 'inboundFormId' | 'createdAt' | 'updatedAt' | 'allowedHostnames'> &
    Partial<Pick<InboundForm, 'allowedHostnames'>>
