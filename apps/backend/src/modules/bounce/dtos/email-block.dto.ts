import { Expose } from 'class-transformer'
import { EmailBlock } from '../interfaces/email-block.interface'

export class EmailBlockDto implements Omit<EmailBlock, 'createdAt' | 'updatedAt'> {
    @Expose()
    emailBlockId!: number

    @Expose()
    emailAddress!: string

    @Expose()
    blockCount!: number

    @Expose()
    blockedUntil: Date | null = null
}
