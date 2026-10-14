import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { INestApplication, Logger } from '@nestjs/common'
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { dirname, join } from 'node:path'
import * as fs from 'node:fs/promises'
import { appOptions } from './factories/app.options.js'
import { configureApp, createOpenApiDocument } from './factories/app.setup.js'
import type { Env } from './config/env.schema.js'

async function bootstrap() {
    const app = await NestFactory.create(AppModule, appOptions)

    configureApp(app)

    const specOnly = process.argv.some((arg) => arg === '--spec-only')
    const document = createOpenApiDocument(app)
    const logger = new Logger('Bootstrap')

    if (specOnly || process.env.NODE_ENV !== 'production') {
        await saveOpenApiSpec(app, document)
        logger.log('OpenAPI spec saved.')
    }

    if (specOnly) {
        logger.log('Closing application')
        await app.close()
        logger.log('Application closed')
    } else {
        SwaggerModule.setup('docs', app, document)
        await app.listen(app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true }))
        logger.log(`Application is running on: ${await app.getUrl()}`)
    }
}

async function saveOpenApiSpec(app: INestApplication, document: OpenAPIObject) {
    const configService = app.get<ConfigService<Env, true>>(ConfigService)
    const outputPath =
        configService.get('OPENAPI_PATH', { infer: true }) ??
        join(import.meta.dirname, '../../../packages/api/assets/openapi.json')

    await fs.mkdir(dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, JSON.stringify(document))
}

void bootstrap()
