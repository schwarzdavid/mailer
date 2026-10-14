import { ApiProperty } from '@nestjs/swagger'
import { Expose } from 'class-transformer'
import { SETUP_STEPS } from '../setup.constants.js'
import type { SetupStep } from '../setup.constants.js'

export class SetupStatusDto {
    @Expose()
    @ApiProperty({ type: Boolean })
    needsSetup!: boolean

    @Expose()
    @ApiProperty({ enum: SETUP_STEPS, enumName: 'SetupStep' })
    step!: SetupStep

    static fromStep(step: SetupStep): SetupStatusDto {
        return { needsSetup: step !== 'finished', step }
    }
}
