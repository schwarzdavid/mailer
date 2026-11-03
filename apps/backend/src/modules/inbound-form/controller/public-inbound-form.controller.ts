import { Body, Controller, Get, Header, Param, Post, Req, UseGuards } from '@nestjs/common'
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { AppThrottlerGuard } from '../../throttler-storage/guards/app-throttler.guard.js'
import type { Request } from 'express'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { InboundFormSubmissionService } from '../services/inbound-form-submission.service.js'
import { InboundFormSubmitDto, InboundFormSubmitResultDto } from '../dtos/inbound-form-submit.dto.js'
import { InboundFormTokenDto } from '../dtos/inbound-form-token.dto.js'
import { FormThrottle } from '../helpers/form-throttle.js'
import { INBOUND_FORM_CLIENT_SCRIPT } from '../client/inbound-form-client.js'

@ApiTags('public-form')
@UseGuards(AppThrottlerGuard)
@Controller('public/form')
export class PublicInboundFormController {
    constructor(private readonly submissionService: InboundFormSubmissionService) {}

    @SkipThrottle()
    @Get('client.js')
    @Header('Content-Type', 'application/javascript; charset=utf-8')
    @Header('Cache-Control', 'public, max-age=86400')
    @Header('Cross-Origin-Resource-Policy', 'cross-origin')
    @ApiProduces('application/javascript')
    @ApiOkResponse({ schema: { type: 'string' } })
    getInboundFormClient(): string {
        return INBOUND_FORM_CLIENT_SCRIPT
    }

    @ResponseDto(InboundFormTokenDto)
    @FormThrottle('token')
    @Post(':slug/token')
    async issueInboundFormToken(@Param('slug') slug: string, @Req() request: Request): Promise<InboundFormTokenDto> {
        const issued = await this.submissionService.issueToken(slug, request.headers, request.ip ?? '')

        return InboundFormTokenDto.fromIssuedToken(issued)
    }

    @ResponseDto(InboundFormSubmitResultDto)
    @FormThrottle('submit')
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
            request.ip ?? '',
        )

        return { status: 'accepted' }
    }
}
