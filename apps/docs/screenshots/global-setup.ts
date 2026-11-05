import process from 'node:process'
import { startStack } from 'e2e-stack'

export default async function globalSetup(): Promise<() => Promise<void>> {
    const stack = await startStack({
        mailHostname: 'mx.example.com',
        serverIpv4: '203.0.113.10',
        serverIpv6: '2001:db8::10',
        log: (message) => console.log(`[screenshots] ${message}`),
    })
    process.env.DOCS_BASE_URL = 'https://app.example.com'
    process.env.DOCS_FRONTEND_URL = stack.baseUrl
    process.env.DOCS_API_URL = stack.apiUrl
    process.env.DOCS_SETUP_TOKEN = stack.setupToken
    process.env.DOCS_MAILHOG_URL = stack.mailhogUrl
    process.env.DOCS_GREENMAIL_SMTP_PORT = String(stack.greenmailSmtpPort)
    return stack.stop
}
