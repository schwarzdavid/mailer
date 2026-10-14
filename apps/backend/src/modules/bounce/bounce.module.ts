import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { BounceModel } from './models/bounce.model.js'
import { EmailBlockModel } from './models/email-block.model.js'
import { EmailBlockService } from './services/email-block.service.js'
import { BounceService } from './services/bounce.service.js'
import { DsnParserService } from './services/dsn-parser.service.js'
import { BounceMailboxService } from './services/bounce-mailbox.service.js'
import { BounceController } from './controller/bounce.controller.js'

@Module({
    imports: [SequelizeModule.forFeature([BounceModel, EmailBlockModel])],
    controllers: [BounceController],
    providers: [EmailBlockService, BounceService, DsnParserService, BounceMailboxService],
    exports: [EmailBlockService, BounceService],
})
export class BounceModule {}
