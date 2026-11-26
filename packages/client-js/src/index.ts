export { MailerError, type SendErrorCode } from './core/mailer-error.ts'
export type { ClientOptions } from './core/options.ts'
export { createFormClient } from './forms/form-client.ts'
export { MailerForm } from './forms/mailer-form.ts'
export type { MailerFormOptions } from './forms/mailer-form.ts'
export type {
    FormClient,
    FormSubmission,
    FormSubmitResult,
    FormValues,
    SecurityLocation,
    TimedTokenPlacement,
} from './forms/types.ts'
export { MailerSender } from './send/mailer-sender.ts'
export type { MailerSenderOptions, SendRequest, SendResult } from './send/mailer-sender.ts'
