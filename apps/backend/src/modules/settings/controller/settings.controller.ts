import { Body, Controller, Get, Post, Put } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { RequireAbility } from '../../permission/decorators/RequireAbility.js'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { SettingsService } from '../services/settings.service.js'
import { SettingsDto } from '../dtos/settings.dto.js'
import { SendingDomainDto } from '../dtos/sending-domain.dto.js'
import { SendingDomainConfigureDto } from '../dtos/sending-domain-configure.dto.js'

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
    @Put('sending-domain')
    configureSendingDomain(@Body() config: SendingDomainConfigureDto): Promise<SendingDomainDto> {
        return this.settingsService.configureSendingDomain({
            fqdn: config.fqdn,
            serverIpv4: config.serverIpv4,
            serverIpv6: config.serverIpv6 ?? null,
        })
    }

    @RequireAbility({ action: 'update', subject: 'Settings' })
    @ResponseDto(SendingDomainDto)
    @Post('sending-domain/refresh')
    refreshSendingDomain(): Promise<SendingDomainDto> {
        return this.settingsService.refreshSendingDomain()
    }
}
