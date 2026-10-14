import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import type { ApiKey } from '../interfaces/api-key.interface.js'

export const ApiKeyPrincipal = createParamDecorator((_, ctx: ExecutionContext): ApiKey => {
    const request = ctx.switchToHttp().getRequest<{ apiKey?: ApiKey }>()
    if (!request.apiKey) {
        throw new UnauthorizedException()
    }
    return request.apiKey
})
