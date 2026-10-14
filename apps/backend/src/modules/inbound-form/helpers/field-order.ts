import type { OrderItem } from 'sequelize'
import { InboundFormFieldModel } from '../models/inbound-form-field.model.js'

const FIELDS_ASSOCIATION = { model: InboundFormFieldModel, as: 'inboundFormFields' }

export const FIELD_ORDER: OrderItem[] = [
    ['position', 'ASC'],
    ['inboundFormFieldId', 'ASC'],
]

export const INCLUDED_FIELD_ORDER: OrderItem[] = [
    [FIELDS_ASSOCIATION, 'position', 'ASC'],
    [FIELDS_ASSOCIATION, 'inboundFormFieldId', 'ASC'],
]
