import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuth } from '../../auth/decorators/JwtAuth';
import { DomainCreateDto } from '../dtos/domain-create.dto';
import { DomainDto } from '../dtos/domain.dto';

@JwtAuth()
@ApiTags('domain')
@Controller('domain')
export class DomainController {
    @Post()
    async createDomain(@Body() {fqdn}: DomainCreateDto): Promise<DomainDto> {
        return Promise.resolve({
            domainId: 1,
            fqdn,
        })
    }
}
