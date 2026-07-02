import { IsFQDN, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DomainCreate } from '../interfaces/domain.interface';

export class DomainCreateDto implements DomainCreate {
    @ApiProperty({ type: String })
    @IsString()
    @IsNotEmpty()
    @IsFQDN()
    fqdn!: string;
}
