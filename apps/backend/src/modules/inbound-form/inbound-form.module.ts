import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { InboundFormModel } from './models/inbound-form.model'
import { InboundFormFieldModel } from './models/inbound-form-field.model'
import { InboundFormSecurityModel } from './models/inbound-form-security.model'
import { InboundFormReceiverModel } from './models/inbound-form-receiver.model'
import { InboundFormTemplateModel } from './models/inbound-form-template.model'
import { InboundFormSubmissionModel } from './models/inbound-form-submission.model'
import { InboundFormDeliveryModel } from './models/inbound-form-delivery.model'
import { DomainModule } from '../domain/domain.module'
import { MailModule } from '../mail/mail.module'
import { InboundFormController } from './controller/inbound-form.controller'
import { PublicInboundFormController } from './controller/public-inbound-form.controller'
import { InboundFormService } from './services/inbound-form.service'
import { InboundFormTemplateService } from './services/inbound-form-template.service'
import { InboundFormSecurityService } from './services/inbound-form-security.service'
import { InboundFormSubmissionService } from './services/inbound-form-submission.service'

@Module({
    imports: [
        SequelizeModule.forFeature([
            InboundFormModel,
            InboundFormFieldModel,
            InboundFormSecurityModel,
            InboundFormReceiverModel,
            InboundFormTemplateModel,
            InboundFormSubmissionModel,
            InboundFormDeliveryModel,
        ]),
        DomainModule,
        MailModule,
    ],
    controllers: [InboundFormController, PublicInboundFormController],
    providers: [
        InboundFormService,
        InboundFormTemplateService,
        InboundFormSecurityService,
        InboundFormSubmissionService,
    ],
})
export class InboundFormModule {}
