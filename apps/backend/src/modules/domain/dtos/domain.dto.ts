import { Domain } from '../interfaces/domain.interface';
import { IsFQDN, IsNotEmpty, IsString } from 'class-validator';

export class DomainDto implements Domain {
    domainId!: number;

    @IsString()
    @IsNotEmpty()
    @IsFQDN()
    fqdn!: string;
}
