import { Body, Controller, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { DomainCreateDto } from '../dtos/domain-create.dto'
import { DomainDto } from '../dtos/domain.dto'
import { DomainService } from '../services/domain.service'

@JwtAuth()
@ApiTags('domain')
@Controller('domain')
export class DomainController {
    constructor(private readonly domainService: DomainService) {}

    @Post()
    async createDomain(@Body() domainCreate: DomainCreateDto): Promise<DomainDto> {
        const domain = await this.domainService.createDomain(domainCreate)

        return DomainDto.fromDomain(domain)
    }
}
