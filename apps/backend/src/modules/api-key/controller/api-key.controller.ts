import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseIntPipe,
    Post,
    SerializeOptions,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { Principal } from '../../auth/decorators/Principal.js'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility.js'
import type { AppAbility } from '../../permission/interfaces/app-ability.js'
import type { UserWithRole } from '../../user/interfaces/user.interface.js'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { ApiKeyService } from '../services/api-key.service.js'
import { ApiKeyCreatedDto, ApiKeyDto } from '../dtos/api-key.dto.js'
import { ApiKeyCreateDto } from '../dtos/api-key-create.dto.js'

@JwtAuth()
@ApiTags('api-key')
@Controller('project/:projectId/api-keys')
export class ApiKeyController {
    constructor(private readonly apiKeyService: ApiKeyService) {}

    @SerializeOptions({ type: ApiKeyDto })
    @Get()
    async getApiKeys(
        @Param('projectId', ParseIntPipe) projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ApiKeyDto[]> {
        const apiKeys = await this.apiKeyService.listKeys(projectId, ability)

        return apiKeys.map((apiKey) => ApiKeyDto.fromApiKey(apiKey))
    }

    @ResponseDto(ApiKeyCreatedDto)
    @Post()
    async createApiKey(
        @Param('projectId', ParseIntPipe) projectId: number,
        @Body() body: ApiKeyCreateDto,
        @Principal() principal: UserWithRole,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ApiKeyCreatedDto> {
        const { apiKey, key } = await this.apiKeyService.createKey(projectId, body.name, principal, ability)

        return ApiKeyCreatedDto.fromCreated(apiKey, key)
    }

    @HttpCode(HttpStatus.NO_CONTENT)
    @Delete(':apiKeyId')
    async revokeApiKey(
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('apiKeyId', ParseIntPipe) apiKeyId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.apiKeyService.revokeKey(projectId, apiKeyId, ability)
    }
}
