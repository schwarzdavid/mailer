import { NestFactory } from '@nestjs/core'
import type { OpenAPIObject } from '@nestjs/swagger'
import { AppModule } from '../app.module.js'
import { API_PREFIX, createOpenApiDocument } from '../factories/app.setup.js'

export async function createPreviewOpenApiDocument(): Promise<OpenAPIObject> {
    const app = await NestFactory.create(AppModule, { preview: true, logger: ['error'] })

    try {
        app.setGlobalPrefix(API_PREFIX)
        return createOpenApiDocument(app)
    } finally {
        await app.close()
    }
}
