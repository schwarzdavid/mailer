import { Credentials } from '../interfaces/credentials.interface';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CredentialsDto implements Credentials {
    @IsEmail()
    email!: string;

    @MinLength(1, { message: 'ERRORS.VALIDATION.REQUIRED' })
    @IsString()
    password!: string;
}
