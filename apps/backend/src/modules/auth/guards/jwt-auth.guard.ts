import { AuthGuard } from '@nestjs/passport'
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable } from 'rxjs'
import { PUBLIC_KEY } from '../decorators/Public'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
    constructor(private readonly reflector: Reflector) {
        super()
    }

    override canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        const shouldSkip = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ])

        if (shouldSkip) {
            return true
        }

        return super.canActivate(context)
    }
}
