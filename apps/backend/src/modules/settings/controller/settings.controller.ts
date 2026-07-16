import { Body, Controller, Get, Post, Put } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { SettingsService } from '../services/settings.service'
import { SettingsDto } from '../dtos/settings.dto'
import { SendingDomainDto } from '../dtos/sending-domain.dto'
import { SendingDomainConfigureDto } from '../dtos/sending-domain-configure.dto'

@JwtAuth()
@ApiTags('settings')
@Controller('settings')
export class SettingsController {
    constructor(private readonly settingsService: SettingsService) {}

    @ResponseDto(SettingsDto)
    @Get()
    async getSettings(): Promise<SettingsDto> {
        const sendingDomain = await this.settingsService.getSendingDomain()

        return { sendingDomain }
    }

    @ResponseDto(SendingDomainDto)
    @Put('sending-domain')
    configureSendingDomain(@Body() config: SendingDomainConfigureDto): Promise<SendingDomainDto> {
        return this.settingsService.configureSendingDomain({
            fqdn: config.fqdn,
            serverIpv4: config.serverIpv4,
            serverIpv6: config.serverIpv6 ?? null,
        })
    }

    @ResponseDto(SendingDomainDto)
    @Post('sending-domain/refresh')
    refreshSendingDomain(): Promise<SendingDomainDto> {
        return this.settingsService.refreshSendingDomain()
    }
}
