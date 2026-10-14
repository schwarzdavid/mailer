import { HttpException, HttpStatus } from '@nestjs/common'

export enum PublicSendErrorCode {
    FROM_DOMAIN_NOT_ALLOWED = 'FROM_DOMAIN_NOT_ALLOWED',
    FROM_DOMAIN_NOT_READY = 'FROM_DOMAIN_NOT_READY',
    RECIPIENT_BLOCKED = 'RECIPIENT_BLOCKED',
    DELIVERY_FAILED = 'DELIVERY_FAILED',
}

const RESPONSE_BY_CODE: Record<PublicSendErrorCode, { status: HttpStatus; error: string }> = {
    [PublicSendErrorCode.FROM_DOMAIN_NOT_ALLOWED]: { status: HttpStatus.FORBIDDEN, error: 'Forbidden' },
    [PublicSendErrorCode.FROM_DOMAIN_NOT_READY]: {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
    },
    [PublicSendErrorCode.RECIPIENT_BLOCKED]: { status: HttpStatus.UNPROCESSABLE_ENTITY, error: 'Unprocessable Entity' },
    [PublicSendErrorCode.DELIVERY_FAILED]: { status: HttpStatus.BAD_GATEWAY, error: 'Bad Gateway' },
}

export class PublicSendException extends HttpException {
    constructor(
        readonly code: PublicSendErrorCode,
        message: string,
        readonly mailMessageId?: number,
    ) {
        const { status, error } = RESPONSE_BY_CODE[code]
        super(
            {
                statusCode: status,
                error,
                message,
                code,
                ...(mailMessageId !== undefined && { mailMessageId }),
            },
            status,
        )
    }
}
