import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { AppAbility } from '../interfaces/app-ability'

export const CurrentAbility = createParamDecorator((_, ctx: ExecutionContext): AppAbility => {
    const request = ctx.switchToHttp().getRequest<{ ability?: AppAbility }>()
    if (!request.ability) {
        throw new UnauthorizedException()
    }
    return request.ability
})
