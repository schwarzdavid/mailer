import { simpleParser, type ParsedMail } from 'mailparser'
import { expect, vi } from 'vitest'

export interface MailhogMessage {
    ID: string
    Raw: {
        From: string
        To: string[]
        Data: string
    }
    Content: {
        Headers: Record<string, string[]>
        Body: string
    }
}

export interface MailhogMessages {
    total: number
    items: MailhogMessage[]
}

export function header(message: MailhogMessage, name: string): string[] {
    const key = Object.keys(message.Content.Headers).find(
        (headerName) => headerName.toLowerCase() === name.toLowerCase(),
    )
    return key ? message.Content.Headers[key]! : []
}

export async function fetchMessages(mailhogUrl: string): Promise<MailhogMessages> {
    const response = await fetch(`${mailhogUrl}/api/v2/messages`)
    return (await response.json()) as MailhogMessages
}

export async function fetchMessagesTo(mailhogUrl: string, address: string): Promise<MailhogMessage[]> {
    const query = new URLSearchParams({ kind: 'to', query: address })
    const response = await fetch(`${mailhogUrl}/api/v2/search?${query.toString()}`)
    return ((await response.json()) as MailhogMessages).items
}

export async function waitForMessagesTo(mailhogUrl: string, address: string, count = 1): Promise<MailhogMessage[]> {
    return await vi.waitFor(
        async () => {
            const messages = await fetchMessagesTo(mailhogUrl, address)
            expect(messages.length).toBeGreaterThanOrEqual(count)
            return messages
        },
        { timeout: 15_000, interval: 250 },
    )
}

export async function parseMessage(message: MailhogMessage): Promise<ParsedMail> {
    return await simpleParser(message.Raw.Data)
}
