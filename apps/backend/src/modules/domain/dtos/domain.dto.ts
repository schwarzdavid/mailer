import { Domain } from '../interfaces/domain.interface';
import { IsFQDN, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DomainDto implements Omit<Domain, 'activeDkimId'> {
    @ApiProperty({type: Number})
    domainId!: number;

    @IsString()
    @IsNotEmpty()
    @IsFQDN()
    fqdn!: string;
}
