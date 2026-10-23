import { createTransport } from 'nodemailer'
import type { SentMessageInfo } from 'nodemailer/lib/smtp-transport/index.js'

type SmtpError = Error & { command?: string; responseCode?: number; response?: string }

const env = process.env
const domain = env.SMOKE_DOMAIN
if (env.SMTP_HOST !== 'mail' || env.SMTP_TLS_SERVERNAME !== domain || env.IMAP_TLS_SERVERNAME !== domain) {
    throw new Error(
        `unexpected mail settings: SMTP_HOST=${env.SMTP_HOST} SMTP_TLS_SERVERNAME=${env.SMTP_TLS_SERVERNAME} IMAP_TLS_SERVERNAME=${env.IMAP_TLS_SERVERNAME}`,
    )
}
const options = {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: env.SMTP_SECURE === 'true',
    requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
}
const unnamed = createTransport(options)
try {
    await unnamed.verify()
    throw new Error(`certificate accepted for host ${env.SMTP_HOST} without a servername`)
} catch (error) {
    if (!/does not match certificate's altnames/.test((error as SmtpError).message)) {
        throw error
    }
    console.log(`without servername the certificate is refused: ${(error as SmtpError).message}`)
} finally {
    unnamed.close()
}
const transport = createTransport({ ...options, tls: { servername: env.SMTP_TLS_SERVERNAME } })
const send = (from: string) =>
    transport.sendMail({
        envelope: { from, to: `bounce@${domain}` },
        from,
        to: `bounce@${domain}`,
        subject: 'smoke submission',
        text: 'smoke submission',
    })

await transport.verify()
console.log(`verify ok against ${env.SMTP_TLS_SERVERNAME} on ${env.SMTP_HOST}:${env.SMTP_PORT}`)
const info = await send(`bounce@${domain}`)
if (!info.accepted.includes(`bounce@${domain}`)) {
    throw new Error(`own envelope not accepted: ${info.response}`)
}
console.log(`own envelope accepted: ${info.response}`)
let spoofed: SentMessageInfo | undefined
try {
    spoofed = await send(`other@${domain}`)
} catch (error) {
    const smtpError = error as SmtpError
    console.log(
        `foreign envelope rejected: command=${smtpError.command} responseCode=${smtpError.responseCode} response=${smtpError.response}`,
    )
}
transport.close()
if (spoofed) {
    throw new Error(`foreign envelope accepted: ${spoofed.response}`)
}
