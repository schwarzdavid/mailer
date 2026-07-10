import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { InboundFormModel } from './models/inbound-form.model'
import { InboundFormFieldModel } from './models/inbound-form-field.model'
import { InboundFormSecurityModel } from './models/inbound-form-security.model'
import { InboundFormReceiverModel } from './models/inbound-form-receiver.model'
import { InboundFormTemplateModel } from './models/inbound-form-template.model'

@Module({
    imports: [
        SequelizeModule.forFeature([
            InboundFormModel,
            InboundFormFieldModel,
            InboundFormSecurityModel,
            InboundFormReceiverModel,
            InboundFormTemplateModel,
        ]),
    ],
})
export class InboundFormModule {}
