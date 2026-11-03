import { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { appOptions } from '../../src/factories/app.options.js'
import { configureApp } from '../../src/factories/app.setup.js'

/**
 * Boots the full application from AppModule with the same `configureApp` setup
 * as src/main.ts, so the suite exercises production's global prefix, CORS,
 * validation and serialization. Config points at the shared containers via the
 * env applied in `env.ts`.
 *
 * It boots through NestFactory like main.ts rather than a testing module: a
 * testing module instantiates providers before the HTTP adapter exists, so
 * ServeStaticModule would pick its no-op loader and never serve the frontend.
 */
export async function createTestApp(): Promise<INestApplication<App>> {
    const app = await NestFactory.create<INestApplication<App>>(AppModule, {
        ...appOptions,
        abortOnError: false,
        logger: ['error'],
    })
    configureApp(app)

    await app.init()
    return app
}
