import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PUBLIC_KEY } from '../../auth/decorators/Public.js'
import { AbilityFactory } from '../services/ability-factory.service.js'
import { ABILITY_KEY, AbilityRequirement } from '../decorators/RequireAbility.js'
import { AppAbility } from '../interfaces/app-ability.js'
import { User } from '../../user/interfaces/user.interface.js'

@Injectable()
export class PoliciesGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly abilityFactory: AbilityFactory,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const shouldSkip = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ])
        if (shouldSkip) {
            return true
        }

        const request = context.switchToHttp().getRequest<{ user?: User; ability?: AppAbility }>()
        if (!request.user) {
            return false
        }

        const ability = await this.abilityFactory.createForUser(request.user)
        request.ability = ability

        const requirements =
            this.reflector.getAllAndOverride<AbilityRequirement[]>(ABILITY_KEY, [
                context.getHandler(),
                context.getClass(),
            ]) ?? []

        return requirements.every((requirement) => ability.can(requirement.action, requirement.subject))
    }
}
