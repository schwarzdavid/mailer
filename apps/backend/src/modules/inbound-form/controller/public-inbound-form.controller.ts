import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ThrottlerGuard } from '@nestjs/throttler'
import type { Request } from 'express'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { InboundFormSubmissionService } from '../services/inbound-form-submission.service'
import { InboundFormSubmitDto, InboundFormSubmitResultDto } from '../dtos/inbound-form-submit.dto'

@ApiTags('public-form')
@UseGuards(ThrottlerGuard)
@Controller('public/form')
export class PublicInboundFormController {
    constructor(private readonly submissionService: InboundFormSubmissionService) {}

    @ResponseDto(InboundFormSubmitResultDto)
    @Post(':slug')
    async submitInboundForm(
        @Param('slug') slug: string,
        @Body() body: InboundFormSubmitDto,
        @Req() request: Request,
    ): Promise<InboundFormSubmitResultDto> {
        await this.submissionService.submitForm(
            slug,
            { security: body.security, data: body.data },
            request.headers,
            request.query,
        )

        return { status: 'accepted' }
    }
}
