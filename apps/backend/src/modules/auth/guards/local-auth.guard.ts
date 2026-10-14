import { AuthGuard } from '@nestjs/passport'
import { ExecutionContext, Injectable, ValidationPipe } from '@nestjs/common'
import type { Request } from 'express'
import { CredentialsDto } from '../dtos/credentials.dto.js'
import { validationPipeOptions } from '../../../factories/app.setup.js'

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
    private readonly credentialsPipe = new ValidationPipe(validationPipeOptions)

    override async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>()

        const credentials: unknown = await this.credentialsPipe.transform(request.body, {
            type: 'body',
            metatype: CredentialsDto,
        })
        request.body = credentials

        return (await super.canActivate(context)) as boolean
    }
}
