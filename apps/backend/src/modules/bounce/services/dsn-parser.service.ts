import { Injectable } from '@nestjs/common'
import { simpleParser } from 'mailparser'
import { BounceType } from '../interfaces/bounce.interface'

declare module 'mailparser' {
    interface MailParserOptions {
        keepDeliveryStatus?: boolean
    }
}

export interface ParsedDsnRecipient {
    emailAddress: string
    type: BounceType
    statusCode: string | null
    reason: string
}

export interface ParsedDsn {
    messageId: string | null
    receivedAt: Date
    recipients: ParsedDsnRecipient[]
}

@Injectable()
export class DsnParserService {
    async parse(source: Buffer | string): Promise<ParsedDsn | null> {
        const mail = await simpleParser(source, { keepDeliveryStatus: true })
        const deliveryStatus = mail.attachments.find(
            (attachment) => attachment.contentType === 'message/delivery-status',
        )
        if (!deliveryStatus) {
            return null
        }

        const groups = this.parseFieldGroups(deliveryStatus.content.toString('utf8'))
        const recipients: ParsedDsnRecipient[] = []

        for (const group of groups) {
            const finalRecipient = group['final-recipient'] ?? group['original-recipient']
            const action = group['action']?.toLowerCase()
            if (!finalRecipient || !action) {
                continue
            }

            const emailAddress = this.extractAddress(finalRecipient)
            if (!emailAddress) {
                continue
            }

            const statusCode = this.extractStatusCode(group['status'])
            const type = this.classify(action, statusCode)
            if (!type) {
                continue
            }

            recipients.push({
                emailAddress,
                type,
                statusCode,
                reason: this.extractReason(group, action),
            })
        }

        if (recipients.length === 0) {
            return null
        }

        return {
            messageId: mail.messageId ?? null,
            receivedAt: mail.date ?? new Date(),
            recipients,
        }
    }

    private parseFieldGroups(content: string): Record<string, string>[] {
        return content
            .split(/\r?\n\r?\n/)
            .map((block) => {
                const fields: Record<string, string> = {}
                for (const line of block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
                    const separator = line.indexOf(':')
                    if (separator === -1) {
                        continue
                    }
                    fields[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim()
                }
                return fields
            })
            .filter((fields) => Object.keys(fields).length > 0)
    }

    private extractAddress(value: string): string | null {
        const trimmed = (value.includes(';') ? value.slice(value.indexOf(';') + 1) : value).trim().toLowerCase()
        const address = trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1).trim() : trimmed
        return address.includes('@') && address.length <= 255 ? address : null
    }

    private extractStatusCode(rawStatus: string | undefined): string | null {
        if (!rawStatus) {
            return null
        }
        const match = /^\d\.\d{1,3}\.\d{1,3}/.exec(rawStatus)
        return match ? match[0] : null
    }

    private classify(action: string, statusCode: string | null): BounceType | null {
        if (action === 'failed') {
            return statusCode?.startsWith('4') ? BounceType.TRANSIENT : BounceType.PERMANENT
        }
        if (action === 'delayed') {
            return BounceType.TRANSIENT
        }
        return null
    }

    private extractReason(fields: Record<string, string>, action: string): string {
        const diagnostic = fields['diagnostic-code']
        if (diagnostic) {
            return (diagnostic.includes(';') ? diagnostic.slice(diagnostic.indexOf(';') + 1) : diagnostic).trim()
        }
        const statusCode = fields['status']
        return statusCode ? `${action} (${statusCode})` : action
    }
}
