import type {
    InboundFormSubmitDto,
    InboundFormSubmitResultDto,
    InboundFormTokenDto,
    PublicSendDto,
    PublicSendResultDto,
} from 'api'
import type { FormSubmission, FormSubmitResult } from './forms/types.ts'
import type { SendRequest, SendResult } from './send/mailer-sender.ts'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

export const sendRequestMatches: Equal<SendRequest, PublicSendDto> = true
export const sendResultMatches: Equal<SendResult, PublicSendResultDto> = true
export const formSubmitResultMatches: Equal<FormSubmitResult, InboundFormSubmitResultDto> = true
export const formSubmissionMatches: Equal<Pick<FormSubmission, 'data' | 'security'>, InboundFormSubmitDto> = true
export const tokenWireShapeMatches: Equal<
    { token: string; waitMs: number },
    Pick<InboundFormTokenDto, 'token' | 'waitMs'>
> = true
