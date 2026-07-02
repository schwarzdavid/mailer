import { IsFQDN, IsNotEmpty, IsString } from 'class-validator'
import { DomainCreate } from '../interfaces/domain.interface'
import { Expose } from 'class-transformer'

export class DomainCreateDto implements DomainCreate {
    @Expose()
    @IsString()
    @IsNotEmpty()
    @IsFQDN()
    fqdn!: string
}
