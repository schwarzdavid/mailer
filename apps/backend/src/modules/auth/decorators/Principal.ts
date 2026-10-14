import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { UserWithRole } from '../../user/interfaces/user.interface.js'

export const Principal = createParamDecorator((_, ctx: ExecutionContext): UserWithRole => {
    const request = ctx.switchToHttp().getRequest<{ user?: UserWithRole }>()
    if (!request.user) {
        throw new UnauthorizedException()
    }
    return request.user
})
