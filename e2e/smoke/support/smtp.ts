import { connect } from 'node:net'
import { createTransport } from 'nodemailer'

type SmtpError = Error & { command?: string; responseCode?: number; response?: string }

function localTransport(port: number) {
    return createTransport({ host: 'localhost', port, secure: false, ignoreTLS: true })
}

export async function relayFromOutside(port: number): Promise<string> {
    const transport = localTransport(port)
    try {
        await transport.sendMail({
            envelope: { from: 'smoke@example.org', to: 'victim@example.org' },
            from: 'smoke@example.org',
            to: 'victim@example.org',
            subject: 'relay',
            text: 'relay',
        })
    } catch (error) {
        const smtpError = error as SmtpError
        return smtpError.response ?? smtpError.message
    } finally {
        transport.close()
    }
    throw new Error('port 25 relayed mail for victim@example.org')
}

export function smtpGreeting(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = connect({ host: 'localhost', port })
        socket.setEncoding('utf8')
        socket.setTimeout(10_000, () => socket.destroy(new Error(`no SMTP greeting on port ${port} within 10 s`)))
        socket.once('data', (line: string) => {
            socket.end('QUIT\r\n')
            resolve(line.trim())
        })
        socket.once('error', reject)
    })
}

export async function deliverDsn(port: number, recipient: string, raw: string): Promise<void> {
    const transport = localTransport(port)
    try {
        await transport.sendMail({ envelope: { from: '', to: recipient }, raw })
    } finally {
        transport.close()
    }
}
