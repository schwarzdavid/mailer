import { Body, Controller, HttpCode, HttpStatus, Post, SerializeOptions } from '@nestjs/common'
import { ApiAcceptedResponse, ApiTags } from '@nestjs/swagger'
import { ApiKeyAuth } from '../decorators/ApiKeyAuth.js'
import { ApiKeyPrincipal } from '../decorators/ApiKeyPrincipal.js'
import type { ApiKey } from '../interfaces/api-key.interface.js'
import { PublicSendService } from '../services/public-send.service.js'
import { PublicSendDto, PublicSendResultDto } from '../dtos/public-send.dto.js'

@ApiTags('public-send')
@Controller('v1')
export class PublicSendController {
    constructor(private readonly publicSendService: PublicSendService) {}

    @ApiKeyAuth()
    @HttpCode(HttpStatus.ACCEPTED)
    @SerializeOptions({ type: PublicSendResultDto })
    @ApiAcceptedResponse({ type: PublicSendResultDto })
    @Post('send')
    async sendMail(@Body() body: PublicSendDto, @ApiKeyPrincipal() apiKey: ApiKey): Promise<PublicSendResultDto> {
        const { mailMessageId } = await this.publicSendService.send(apiKey, body)

        return { mailMessageId, status: 'sent' }
    }
}
