import { Credentials } from '../interfaces/credentials.interface';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CredentialsDto implements Credentials {
    @IsString()
    @IsEmail()
    @IsNotEmpty()
    email!: string;

    @IsString()
    @IsNotEmpty()
    password!: string;
}
