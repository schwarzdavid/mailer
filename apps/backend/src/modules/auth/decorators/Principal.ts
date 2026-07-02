import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { User } from '../../user/interfaces/user.interface';

export const Principal = createParamDecorator((_, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<{ user?: User }>();
    if (!request.user) {
        throw new UnauthorizedException();
    }
    return request.user;
});
