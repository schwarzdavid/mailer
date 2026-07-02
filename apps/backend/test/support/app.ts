import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module';

/**
 * Boots the full application from AppModule, mirroring src/main.ts so the suite
 * exercises the same global prefix and validation pipeline as production. Points
 * config at the shared containers started in global setup.
 */
export async function createTestApp(): Promise<INestApplication<App>> {
    Object.assign(process.env, inject('e2eEnv'));

    const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
    }).compile();

    const app = moduleRef.createNestApplication<INestApplication<App>>();

    app.setGlobalPrefix('api');
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
        }),
    );

    await app.init();
    return app;
}
