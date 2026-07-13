import { Expose } from 'class-transformer'
import { Bounce, BounceType } from '../interfaces/bounce.interface'

export class BounceDto implements Omit<Bounce, 'messageId' | 'createdAt' | 'updatedAt'> {
    @Expose()
    bounceId!: number

    @Expose()
    emailAddress!: string

    @Expose()
    type!: BounceType

    @Expose()
    statusCode: string | null = null

    @Expose()
    reason!: string

    @Expose()
    receivedAt!: Date
}
