import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';
import { JwtHelperService } from '../services/jwt-helper.service';
import { UserDto } from '../../user/dtos/user.dto';

describe('AuthController', () => {
    let controller: AuthController;
    let createToken: ReturnType<typeof vi.fn>;

    // The principal a passing LocalAuthGuard would attach to the request.
    const principal: UserDto = {
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

    it('signs a token for the authenticated principal and returns it alongside the user', async () => {
        const result = await controller.login(principal);

        expect(createToken).toHaveBeenCalledWith(principal);
        expect(result).toEqual({ token: 'signed-jwt-token', user: principal });
    });

    it('echoes the authenticated principal from the current-user endpoint', () => {
        expect(controller.currentUser(principal)).toBe(principal);
    });
});
