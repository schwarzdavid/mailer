import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { UserService } from '../../src/modules/user/services/user.service';

export interface Credentials {
    email: string;
    password: string;
}

// Persists a user with known credentials so a test can authenticate as them.
// Files sharing the database must use distinct emails to avoid collisions.
export async function seedUser(app: INestApplication, credentials: Credentials): Promise<void> {
    await app.get(UserService).createUser({
        firstName: 'Test',
        lastName: 'User',
        email: credentials.email,
        password: credentials.password,
    });
}

// Logs in through the real endpoint and returns the bearer token.
export async function login(app: INestApplication<App>, credentials: Credentials): Promise<string> {
    const response = await request(app.getHttpServer()).post('/api/auth/login').send(credentials).expect(200);
    return (response.body as { token: string }).token;
}
