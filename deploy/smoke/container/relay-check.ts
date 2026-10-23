import { createTransport } from 'nodemailer'
import type { SentMessageInfo } from 'nodemailer/lib/smtp-transport/index.js'

type SmtpError = Error & { command?: string; responseCode?: number; response?: string }

const domain = process.env.SMOKE_DOMAIN
const transport = createTransport({ host: 'mail', port: 25, secure: false, tls: { servername: domain } })
let relayed: SentMessageInfo | undefined
try {
    relayed = await transport.sendMail({
        envelope: { from: `bounce@${domain}`, to: 'victim@example.org' },
        from: `bounce@${domain}`,
        to: 'victim@example.org',
        subject: 'relay',
        text: 'relay',
    })
} catch (error) {
    if (!/Relay access denied/.test((error as SmtpError).response ?? '')) {
        throw error
    }
    console.log(`unauthenticated relay rejected: ${(error as SmtpError).response}`)
}
transport.close()
if (relayed) {
    throw new Error(`unauthenticated relay accepted: ${relayed.response}`)
}
