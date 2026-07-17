import { Expose } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { AppAbility } from '../../permission/interfaces/app-ability'

type AppRule = AppAbility['rules'][number]

export class AbilityRuleDto {
    @Expose()
    @ApiProperty({ type: String, isArray: true })
    action!: string[]

    @Expose()
    subject!: string

    @Expose()
    @ApiProperty({ required: false, additionalProperties: true })
    conditions?: Record<string, unknown>

    @Expose()
    @ApiProperty({ type: Boolean, required: false })
    inverted?: boolean

    static fromRule(rule: AppRule): AbilityRuleDto {
        return {
            action: Array.isArray(rule.action) ? [...rule.action] : [rule.action],
            subject: String(rule.subject),
            conditions: rule.conditions,
            inverted: rule.inverted || undefined,
        }
    }
}
