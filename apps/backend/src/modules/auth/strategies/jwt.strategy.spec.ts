import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from '@nestjs/cache-manager';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtStrategy } from './jwt.strategy';
import { UserModel } from '../../user/models/user.model';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

describe('JwtStrategy', () => {
    let strategy: JwtStrategy;
    let cacheGet: ReturnType<typeof vi.fn>;
    let cacheSet: ReturnType<typeof vi.fn>;
    let findByPk: ReturnType<typeof vi.fn>;

    const payload: JwtPayload = {
        sub: 99,
        email: 'lin@example.com',
        given_name: 'Lin',
        family_name: 'Clark',
    };

    const dbUser = {
        userId: 99,
        firstName: 'Lin',
        lastName: 'Clark',
        email: 'lin@example.com',
        password: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(() => {
        cacheGet = vi.fn();
        cacheSet = vi.fn();
        findByPk = vi.fn();

        const configService = {
            get: vi.fn().mockReturnValue('test-secret'),
        } as unknown as ConfigService;
        const cacheManager = { get: cacheGet, set: cacheSet } as unknown as Cache;
        const userModel = { findByPk } as unknown as typeof UserModel;

        strategy = new JwtStrategy(configService, cacheManager, userModel);
    });

    it('returns the cached user without touching the database', async () => {
        const cached = { userId: 99, email: 'lin@example.com' };
        cacheGet.mockResolvedValue(cached);

        const result = await strategy.validate(payload);

        expect(result).toBe(cached);
        expect(cacheGet).toHaveBeenCalledWith('auth:user:99');
        expect(findByPk).not.toHaveBeenCalled();
    });

    it('loads the user from the database and caches a password-free principal on a cache miss', async () => {
        cacheGet.mockResolvedValue(undefined);
        findByPk.mockResolvedValue(dbUser);

        const result = await strategy.validate(payload);

        expect(findByPk).toHaveBeenCalledWith(99);
        expect(result.userId).toBe(99);
        expect(result.email).toBe('lin@example.com');
        expect('password' in result).toBe(false);
        // The value stored in the cache is the same password-free principal that is
        // returned — never the raw database row (which still carries the hash).
        expect(cacheSet).toHaveBeenCalledWith('auth:user:99', result);
        const cachedArg = cacheSet.mock.calls[0]![1] as Record<string, unknown>;
        expect('password' in cachedArg).toBe(false);
    });

    it('throws UnauthorizedException when the user no longer exists', async () => {
        cacheGet.mockResolvedValue(undefined);
        findByPk.mockResolvedValue(null);

        await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
        expect(cacheSet).not.toHaveBeenCalled();
    });
});
