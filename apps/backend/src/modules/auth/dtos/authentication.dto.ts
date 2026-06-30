import { Authentication } from '../interfaces/authentication.interface';
import { UserDto } from '../../user/dtos/user.dto';

export class AuthenticationDto implements Authentication {
    token!: string;
    user!: UserDto;
}
