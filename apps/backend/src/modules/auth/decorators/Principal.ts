import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { UserDto } from '../../user/dtos/user.dto';

export const Principal = createParamDecorator((_, ctx: ExecutionContext): UserDto => {
    const request = ctx.switchToHttp().getRequest<{ user?: UserDto }>();
    if (!request.user) {
        throw new UnauthorizedException();
    }
    return request.user;
});
