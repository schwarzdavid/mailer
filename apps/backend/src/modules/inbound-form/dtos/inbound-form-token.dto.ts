import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { IssuedFormToken } from '../interfaces/inbound-form-token.interface.js'

export class InboundFormTokenDto {
    @Expose()
    @ApiProperty({ type: String })
    token!: string

    @Expose()
    @ApiProperty({ type: String, format: 'date-time' })
    notBefore!: string

    @Expose()
    @ApiProperty({ type: String, format: 'date-time' })
    expiresAt!: string

    @Expose()
    @ApiProperty({ type: Number })
    waitMs!: number

    static fromIssuedToken(issued: IssuedFormToken): InboundFormTokenDto {
        return {
            token: issued.token,
            notBefore: issued.notBefore.toISOString(),
            expiresAt: issued.expiresAt.toISOString(),
            waitMs: issued.waitMs,
        }
    }
}
