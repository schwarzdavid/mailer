import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ApiKeyService } from '../services/api-key.service.js'
import { ApiKeyRequest, extractApiKey } from '../helpers/extract-api-key.js'

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
    constructor(private readonly apiKeyService: ApiKeyService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<ApiKeyRequest>()
        const rawKey = extractApiKey(request)
        if (!rawKey) {
            throw new UnauthorizedException('Missing API key')
        }

        const apiKey = await this.apiKeyService.authenticate(rawKey)
        if (!apiKey) {
            throw new UnauthorizedException('Invalid API key')
        }

        request.apiKey = apiKey
        void this.apiKeyService.touchLastUsed(apiKey.apiKeyId)
        return true
    }
}
