import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { InboundFormModel } from './models/inbound-form.model.js'
import { InboundFormFieldModel } from './models/inbound-form-field.model.js'
import { InboundFormSecurityModel } from './models/inbound-form-security.model.js'
import { InboundFormReceiverModel } from './models/inbound-form-receiver.model.js'
import { InboundFormTemplateModel } from './models/inbound-form-template.model.js'
import { InboundFormSubmissionModel } from './models/inbound-form-submission.model.js'
import { InboundFormDeliveryModel } from './models/inbound-form-delivery.model.js'
import { DomainModule } from '../domain/domain.module.js'
import { EncryptionModule } from '../encryption/encryption.module.js'
import { ProjectModule } from '../project/project.module.js'
import { MailModule } from '../mail/mail.module.js'
import { InboundFormController } from './controller/inbound-form.controller.js'
import { PublicInboundFormController } from './controller/public-inbound-form.controller.js'
import { InboundFormService } from './services/inbound-form.service.js'
import { InboundFormTemplateService } from './services/inbound-form-template.service.js'
import { InboundFormSecurityService } from './services/inbound-form-security.service.js'
import { InboundFormSubmissionService } from './services/inbound-form-submission.service.js'

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
        ProjectModule,
        MailModule,
        EncryptionModule,
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
