import { Expose } from 'class-transformer'
import { Bounce, BounceType } from '../interfaces/bounce.interface.js'

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

    static fromBounce(bounce: Bounce): BounceDto {
        return {
            bounceId: bounce.bounceId,
            emailAddress: bounce.emailAddress,
            type: bounce.type,
            statusCode: bounce.statusCode,
            reason: bounce.reason,
            receivedAt: bounce.receivedAt,
        }
    }
}
