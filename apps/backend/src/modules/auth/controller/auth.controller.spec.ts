import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';
import { JwtHelperService } from '../services/jwt-helper.service';
import { User } from '../../user/interfaces/user.interface';
import { UserDto } from '../../user/dtos/user.dto';

describe('AuthController', () => {
    let controller: AuthController;
    let createToken: ReturnType<typeof vi.fn>;

    // The principal a passing LocalAuthGuard would attach to the request: the
    // internal domain user, not a transport DTO.
    const principal: User = {
        userId: 42,
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(async () => {
        createToken = vi.fn().mockResolvedValue('signed-jwt-token');

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [{ provide: JwtHelperService, useValue: { createToken } }],
        }).compile();

        controller = module.get<AuthController>(AuthController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    it('signs a token for the authenticated principal and returns it with a user DTO', async () => {
        const result = await controller.login(principal);

        expect(createToken).toHaveBeenCalledWith(principal);
        expect(result.token).toBe('signed-jwt-token');
        expect(result.user).toBeInstanceOf(UserDto);
        expect(result.user).toEqual(UserDto.toDto(principal));
    });

    it('maps the authenticated principal to a response DTO from the current-user endpoint', () => {
        const result = controller.currentUser(principal);

        expect(result).toBeInstanceOf(UserDto);
        expect(result).toEqual(UserDto.toDto(principal));
    });
});