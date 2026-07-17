import { SetMetadata } from '@nestjs/common'
import { AbilityAction, AbilitySubjectName } from '../interfaces/app-ability'

export interface AbilityRequirement {
    action: AbilityAction
    subject: AbilitySubjectName
}

export const ABILITY_KEY = Symbol('ABILITY_KEY')

export const RequireAbility = (...requirements: AbilityRequirement[]) => SetMetadata(ABILITY_KEY, requirements)
