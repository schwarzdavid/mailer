import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Param,
    Post,
    Req,
    Res,
    SerializeOptions,
    UseGuards,
} from '@nestjs/common'
import { ApiAcceptedResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { AppThrottlerGuard } from '../../throttler-storage/guards/app-throttler.guard.js'
import type { Request, Response } from 'express'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { InboundFormSubmissionService } from '../services/inbound-form-submission.service.js'
import { InboundFormSubmitDto, InboundFormSubmitResultDto } from '../dtos/inbound-form-submit.dto.js'
import { InboundFormTokenDto } from '../dtos/inbound-form-token.dto.js'
import { FormThrottle } from '../helpers/form-throttle.js'
import { InboundFormClientScript } from '../client/inbound-form-client-script.js'

@ApiTags('public-form')
@UseGuards(AppThrottlerGuard)
@Controller('v1/forms')
export class PublicInboundFormController {
    constructor(
        private readonly submissionService: InboundFormSubmissionService,
        private readonly clientScript: InboundFormClientScript,
    ) {}

    @SkipThrottle()
    @Get('client.js')
    @ApiProduces('application/javascript')
    @ApiOkResponse({ schema: { type: 'string' } })
    getInboundFormClient(@Res({ passthrough: true }) response: Response): string {
        const source = this.clientScript.source
        if (source === undefined) {
            throw new NotFoundException('client.js is not built')
        }
        response.set({
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
            'Cross-Origin-Resource-Policy': 'cross-origin',
        })
        return source
    }

    @ResponseDto(InboundFormTokenDto)
    @HttpCode(HttpStatus.OK)
    @FormThrottle('token')
    @Post(':formKey/token')
    async issueInboundFormToken(
        @Param('formKey') formKey: string,
        @Req() request: Request,
    ): Promise<InboundFormTokenDto> {
        const issued = await this.submissionService.issueToken(formKey, request.headers, request.ip ?? '')

        return InboundFormTokenDto.fromIssuedToken(issued)
    }

    @HttpCode(HttpStatus.ACCEPTED)
    @SerializeOptions({ type: InboundFormSubmitResultDto })
    @ApiAcceptedResponse({ type: InboundFormSubmitResultDto })
    @FormThrottle('submit')
    @Post(':formKey')
    async submitInboundForm(
        @Param('formKey') formKey: string,
        @Body() body: InboundFormSubmitDto,
        @Req() request: Request,
    ): Promise<InboundFormSubmitResultDto> {
        await this.submissionService.submitForm(
            formKey,
            { security: body.security, data: body.data },
            request.headers,
            request.query,
            request.ip ?? '',
        )

        return { status: 'accepted' }
    }
}
