import { DomainCreate } from '../interfaces/domain.interface';
import { PickType } from '@nestjs/swagger';
import { DomainDto } from './domain.dto';

export class DomainCreateDto extends PickType(DomainDto, ['fqdn'] as const) implements DomainCreate {}
