export interface EmailBlock {
    emailBlockId: number
    emailAddress: string
    blockCount: number
    blockedUntil: Date | null
    createdAt: Date
    updatedAt: Date
}

export type EmailBlockCreate = Pick<EmailBlock, 'emailAddress'>
