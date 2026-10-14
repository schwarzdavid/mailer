import { expect, test } from '@playwright/test'
import {
    admin,
    card,
    formName,
    formSlug,
    login,
    projectName,
    receiverAddress,
    requireEnv,
    senderDomain,
} from './support/fixtures.ts'

interface MailhogMessage {
    Content: {
        Headers: Record<string, string[] | undefined>
        Body: string
    }
}

interface MailhogSearchResult {
    total: number
    items: MailhogMessage[]
}

function header(message: MailhogMessage, name: string): string {
    const key = Object.keys(message.Content.Headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
    return key ? (message.Content.Headers[key] ?? []).join('\n') : ''
}

function decodeQuotedPrintable(body: string): string {
    return body
        .replace(/=\r?\n/g, '')
        .replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

async function mailsTo(recipient: string): Promise<MailhogMessage[]> {
    const url = new URL('/api/v2/search', requireEnv('E2E_MAILHOG_URL'))
    url.searchParams.set('kind', 'to')
    url.searchParams.set('query', recipient)
    const response = await fetch(url)
    return ((await response.json()) as MailhogSearchResult).items
}

async function latestMailTo(recipient: string): Promise<MailhogMessage> {
    const [mail] = await mailsTo(recipient)
    if (!mail) {
        throw new Error(`No mail was delivered to ${recipient}`)
    }
    return mail
}

const submitUrl = (slug: string) => new URL(`/api/public/form/${slug}`, requireEnv('E2E_API_URL')).href

test.describe.configure({ mode: 'serial' })

test('a public submission is rejected when required fields are missing', async ({ request }) => {
    const response = await request.post(submitUrl(formSlug), { data: { data: { name: 'Jane Doe' } } })
    expect(response.status()).toBe(400)
    expect(JSON.stringify(await response.json())).toContain('email')
})

test('a public submission for an unknown form is not found', async ({ request }) => {
    const response = await request.post(submitUrl('does-not-exist'), { data: { data: {} } })
    expect(response.status()).toBe(404)
})

test('a public submission delivers the rendered template to the receiver', async ({ request }) => {
    const response = await request.post(submitUrl(formSlug), {
        data: {
            data: {
                name: 'Jane Doe',
                email: 'jane.doe@example.org',
                message: 'I would like a quote for 3 widgets.',
            },
        },
    })
    expect(response.status()).toBe(201)
    expect(await response.json()).toEqual({ status: 'accepted' })

    await expect.poll(async () => (await mailsTo(receiverAddress)).length, { timeout: 15_000 }).toBe(1)
    const mail = await latestMailTo(receiverAddress)

    expect(header(mail, 'Subject')).toBe('New contact from Jane Doe')
    expect(header(mail, 'From')).toContain(`noreply@${senderDomain}`)
    expect(header(mail, 'To')).toContain(receiverAddress)
    expect(header(mail, 'Reply-To')).toContain('jane.doe@example.org')
    expect(header(mail, 'DKIM-Signature')).toContain(`d=${senderDomain}`)

    const body = decodeQuotedPrintable(mail.Content.Body)
    expect(body).toContain('<h1>Hello from Jane Doe</h1>')
    expect(body).toContain('<p id="message">I would like a quote for 3 widgets.</p>')
})

test('submitted values are HTML-escaped in the delivered mail', async ({ request }) => {
    await request.post(submitUrl(formSlug), {
        data: { data: { name: '<script>alert(1)</script>', email: 'x@example.org', message: 'hi' } },
    })

    await expect.poll(async () => (await mailsTo(receiverAddress)).length, { timeout: 15_000 }).toBe(2)
    const bodies = (await mailsTo(receiverAddress)).map((mail) => decodeQuotedPrintable(mail.Content.Body))
    const escaped = bodies.find((body) => body.includes('alert(1)'))
    expect(escaped).toBeDefined()
    expect(escaped).not.toContain('<script>')
})

test('deactivating the form in the UI closes the public endpoint', async ({ page, request }) => {
    await login(page, admin)
    await page.goto('/projects')
    await page.getByText(projectName).click()
    await page.getByText(formName).click()

    const general = card(page, 'General')
    await general.getByLabel('Active', { exact: true }).uncheck()
    const saved = page.waitForResponse((response) => response.request().method() === 'PATCH')
    await general.getByRole('button', { name: 'Save' }).click()
    expect((await saved).ok()).toBe(true)

    const response = await request.post(submitUrl(formSlug), {
        data: { data: { name: 'Jane Doe', email: 'jane.doe@example.org' } },
    })
    expect(response.status()).toBe(404)
})
