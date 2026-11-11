import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { RequireAbility } from '../../permission/decorators/RequireAbility.js'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { SettingsService } from '../services/settings.service.js'
import { SettingsDto } from '../dtos/settings.dto.js'
import { SendingDomainDto } from '../dtos/sending-domain.dto.js'

@JwtAuth()
@ApiTags('settings')
@Controller('settings')
export class SettingsController {
    constructor(private readonly settingsService: SettingsService) {}

    @RequireAbility({ action: 'read', subject: 'Settings' })
    @ResponseDto(SettingsDto)
    @Get()
    async getSettings(): Promise<SettingsDto> {
        const sendingDomain = await this.settingsService.getSendingDomain()

        return { sendingDomain: sendingDomain && SendingDomainDto.fromSendingDomain(sendingDomain) }
    }

    @RequireAbility({ action: 'update', subject: 'Settings' })
    @ResponseDto(SendingDomainDto)
    @HttpCode(HttpStatus.OK)
    @Post('sending-domain/refresh')
    async refreshSendingDomain(): Promise<SendingDomainDto> {
        return SendingDomainDto.fromSendingDomain(await this.settingsService.refreshSendingDomain())
    }
}
