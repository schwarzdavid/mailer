import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility.js'
import type { AppAbility } from '../../permission/interfaces/app-ability.js'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { MailMessageService } from '../services/mail-message.service.js'
import { MailMessagePageDto } from '../dtos/mail-message-page.dto.js'
import { MailMessageQueryDto } from '../dtos/mail-message-query.dto.js'

@JwtAuth()
@ApiTags('mail-message')
@Controller('project/:projectId/messages')
export class MailMessageController {
    constructor(private readonly mailMessageService: MailMessageService) {}

    @ResponseDto(MailMessagePageDto)
    @Get()
    async getProjectMessages(
        @Param('projectId', ParseIntPipe) projectId: number,
        @Query() query: MailMessageQueryDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<MailMessagePageDto> {
        const page = await this.mailMessageService.listForProject(
            projectId,
            {
                page: query.page,
                itemsPerPage: query.itemsPerPage,
                search: query.search,
                source: query.source,
                status: query.status,
            },
            ability,
        )

        return MailMessagePageDto.fromMailMessagePage(page)
    }
}
