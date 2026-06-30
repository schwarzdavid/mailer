import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserService } from './user.service';
import { UserModel } from '../models/user.model';

interface CreateAttrs {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
}

describe('UserService', () => {
    let service: UserService;
    let create: ReturnType<typeof vi.fn>;
    // The password value handed to the model, captured so we can prove it was hashed.
    let storedPassword: string | undefined;

    const newUser = {
        firstName: 'Alan',
        lastName: 'Turing',
        email: 'alan@example.com',
        password: 'enigma-1912',
    };

    beforeEach(async () => {
        storedPassword = undefined;
        // Echo the attributes back with the generated columns, mirroring how
        // Sequelize's `create({ returning: true })` resolves the persisted row.
        create = vi.fn((attrs: CreateAttrs, _options: { returning: boolean }) => {
            storedPassword = attrs.password;
            return {
                userId: 7,
                createdAt: new Date(),
                updatedAt: new Date(),
                ...attrs,
            };
        });

        const module: TestingModule = await Test.createTestingModule({
            providers: [UserService, { provide: getModelToken(UserModel), useValue: { create } }],
        }).compile();

        service = module.get(UserService);
    });

    it('persists the supplied profile fields', async () => {
        await service.createUser(newUser);

        expect(create).toHaveBeenCalledWith(
            {
                firstName: 'Alan',
                lastName: 'Turing',
                email: 'alan@example.com',
                password: expect.any(String),
            },
            { returning: true },
        );
    });

    it('hashes the password instead of storing it in plain text', async () => {
        await service.createUser(newUser);

        expect(storedPassword).toBeDefined();
        expect(storedPassword).not.toBe(newUser.password);
        // The stored value is a real bcrypt hash of the original password.
        await expect(bcrypt.compare(newUser.password, storedPassword!)).resolves.toBe(true);
    });

    it('returns a DTO without the password', async () => {
        const result = await service.createUser(newUser);

        expect(result.userId).toBe(7);
        expect(result.email).toBe('alan@example.com');
        expect('password' in result).toBe(false);
    });
});
