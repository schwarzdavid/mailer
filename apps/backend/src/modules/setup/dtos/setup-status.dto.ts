import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'

export class SetupStatusDto {
    @Expose()
    @ApiProperty({ type: Boolean })
    needsSetup!: boolean
}
