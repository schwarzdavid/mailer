import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { App } from 'supertest/types.js'
import { AppModule } from '../../src/app.module.js'
import { appOptions } from '../../src/factories/app.options.js'
import { configureApp } from '../../src/factories/app.setup.js'

/**
 * Boots the full application from AppModule with the same `configureApp` setup
 * as src/main.ts, so the suite exercises production's global prefix, CORS,
 * validation and serialization. Config points at the shared containers via the
 * env applied in `env.ts`.
 */
export async function createTestApp(): Promise<INestApplication<App>> {
    const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
    }).compile()

    const app = moduleRef.createNestApplication<INestApplication<App>>(appOptions)
    configureApp(app)

    await app.init()
    return app
}
