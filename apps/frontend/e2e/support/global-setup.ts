import { startStack } from 'e2e-stack'
import { sendingDomain, serverIpv4 } from './fixtures.ts'

export default async function globalSetup(): Promise<() => Promise<void>> {
    const stack = await startStack({
        mailHostname: sendingDomain,
        serverIpv4,
        log: (message) => console.log(`[e2e] ${message}`),
    })
    process.env.E2E_BASE_URL = stack.baseUrl
    process.env.E2E_API_URL = stack.apiUrl
    process.env.E2E_SETUP_TOKEN = stack.setupToken
    process.env.E2E_MAILHOG_URL = stack.mailhogUrl
    return stack.stop
}
