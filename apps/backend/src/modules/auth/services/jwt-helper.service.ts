import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../user/interfaces/user.interface';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtHelperService {
    constructor(private readonly jwtService: JwtService) {}

    createToken(user: User): Promise<string> {
        return this.jwtService.signAsync({
            sub: user.userId,
            email: user.email,
            given_name: user.firstName,
            family_name: user.lastName,
        } satisfies JwtPayload);
    }
}
