import { Controller, Delete, Get, Param, ParseIntPipe, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { RequireAbility } from '../../permission/decorators/RequireAbility.js'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { BounceService } from '../services/bounce.service.js'
import { EmailBlockService } from '../services/email-block.service.js'
import { BounceDto } from '../dtos/bounce.dto.js'
import { EmailBlockDto } from '../dtos/email-block.dto.js'

@JwtAuth()
@ApiTags('bounce')
@Controller('bounce')
export class BounceController {
    constructor(
        private readonly bounceService: BounceService,
        private readonly emailBlockService: EmailBlockService,
    ) {}

    @RequireAbility({ action: 'read', subject: 'Bounce' })
    @SerializeOptions({ type: BounceDto })
    @Get()
    async getBounces(): Promise<BounceDto[]> {
        return await this.bounceService.getBounces()
    }

    @RequireAbility({ action: 'read', subject: 'Bounce' })
    @SerializeOptions({ type: EmailBlockDto })
    @Get('blocked')
    async getBlockedAddresses(): Promise<EmailBlockDto[]> {
        return await this.emailBlockService.getBlockedAddresses()
    }

    @RequireAbility({ action: 'unblock', subject: 'Bounce' })
    @ResponseDto(EmailBlockDto)
    @Delete('blocked/:emailBlockId')
    async unblock(@Param('emailBlockId', ParseIntPipe) emailBlockId: number): Promise<EmailBlockDto> {
        return await this.emailBlockService.unblock(emailBlockId)
    }
}
