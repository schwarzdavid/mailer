import { Module } from '@nestjs/common'
import { SequelizeModule } from '@nestjs/sequelize'
import { BounceModel } from './models/bounce.model'
import { EmailBlockModel } from './models/email-block.model'
import { EmailBlockService } from './services/email-block.service'
import { BounceService } from './services/bounce.service'
import { DsnParserService } from './services/dsn-parser.service'
import { BounceMailboxService } from './services/bounce-mailbox.service'
import { BounceController } from './controller/bounce.controller'

@Module({
    imports: [SequelizeModule.forFeature([BounceModel, EmailBlockModel])],
    controllers: [BounceController],
    providers: [EmailBlockService, BounceService, DsnParserService, BounceMailboxService],
    exports: [EmailBlockService, BounceService],
})
export class BounceModule {}
