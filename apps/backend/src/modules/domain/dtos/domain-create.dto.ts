import { IsFQDN, IsNotEmpty, IsString } from 'class-validator'
import { Expose } from 'class-transformer'
import { IsIcann } from '../validators/IsIcann'

export class DomainCreateDto {
    @Expose()
    @IsString()
    @IsNotEmpty()
    @IsFQDN()
    @IsIcann()
    fqdn!: string
}
