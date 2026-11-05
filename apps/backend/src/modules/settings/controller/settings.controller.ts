import { Controller, Get, Post } from '@nestjs/common'
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

        return { sendingDomain }
    }

    @RequireAbility({ action: 'update', subject: 'Settings' })
    @ResponseDto(SendingDomainDto)
    @Post('sending-domain/refresh')
    refreshSendingDomain(): Promise<SendingDomainDto> {
        return this.settingsService.refreshSendingDomain()
    }
}
